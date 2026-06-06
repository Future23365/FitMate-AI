## Context

当前生产 `/api/chat` 的 Planner 模型输入由 `DeepSeekModelAdapter.createRequestBody()` 组装：system message 来自 `buildAgentActionSystemPrompt()`，user message 包含 `run`、`step`、`tools`、`observations` 和 `toolResults`。`tools` 由 `ToolRegistry.serializeForPlanner()` 提供，`observations` 和 `toolResults[].projection.model` 负责承载执行后的安全事实和 repair 反馈。

近期为了修复训练输出结构、引用连续性、section coverage、terminal grounding 和失败兜底，默认 system prompt 已经承载了大量 `visibleTrainingProposal`、`routine`、`plan`、`warmup` / `training` / `stretch`、`prescription`、`schedule` 和不可执行请求规则。这些规则多数是正确的，但它们与 tool manifest、schema description、observation 和 terminal validator 的职责发生重叠。

本 change 解决的不是“prompt 文案长短”问题，而是模型可见合同的责任边界：通用 system prompt 应该稳定表达 Agent 如何行动；业务输出结构应由可枚举、可测试、可替换的 output contract 表达；失败和不可执行路径应由 action 语义、repair feedback 和 production fallback 共同收口。

## Goals / Non-Goals

**Goals:**

- 将通用 system prompt 收敛为跨业务能力的 `AgentAction`、tool loop、grounding、policy/resource/validator、安全和不可执行能力边界。
- 新增 Planner 可见 `outputContracts` 通道，用于承载结构化用户输出能力的业务说明、schema summary、examples、grounding 要求和 validator 边界。
- 将 `visibleTrainingProposal` 的业务输出说明迁移到 `outputContracts`，而不是继续作为通用 system prompt 的业务实例规则。
- 明确 failed / diagnostic tool result 与 terminal action 的关系，避免模型用成功 `final_answer` 解释未完成或不可执行结果。
- 保持模型自主语义理解，不新增服务端关键词、正则、同义词、短句模板、固定 `toolName` 分支或用户 phrasing 特判。
- 更新测试，让测试检查合同结构和边界，而不是绑定冗长 prompt 原句。

**Non-Goals:**

- 不改 `/api/chat` 外部请求 schema、NDJSON stream 协议或前端事件协议。
- 不改 `ToolRegistry` 注册范围，不新增保存、写入、训练生成或用户记忆 tool。
- 不放宽 terminal output validator、数据库动作事实校验、ResourceStore、Policy Guard、Resource Contract Validator 或 Response Renderer。
- 不把 `outputContracts` 做成服务端语义路由。它只是模型可见能力说明，不替模型选择 action、tool 或 `payload.kind`。
- 不在本 change 中重构业务 card UI、事实持久化或数据库结构。

## Decisions

### Decision 1: system prompt 只保留通用 Agent 执行合同

system prompt 保留这些跨能力规则：

- 只能输出合法 JSON `AgentAction`。
- action 类型限定为 `tool_call`、`final_answer`、`ask_user`。
- `tool_call.toolName` 必须来自当前 `tools[].name`，`input` 必须匹配该 tool schema。
- `final_answer.content` 是本轮终态，不会触发后续内部工具、保存、等待或查询。
- `final_answer` 在已有 tool result 后必须通过当前 run grounding 或合法 `visibleOutputs[]` 收口。
- diagnostic / failed 事实不能支撑成功 `final_answer`。
- write / high-risk 能力必须经过 `Policy Guard` / confirmation。
- 未注册能力、未执行结果、医疗诊断、保存或写入结果不得承诺。

从 system prompt 移出的内容：

- 具体 outputType 的 payload 结构说明。
- `visibleTrainingProposal.payload.kind` 的完整业务选择细节。
- `routine` / `plan` 的完整 section / prescription / schedule 细节。
- 具体业务 output 的 examples。
- 单个业务 tool 的恢复路径或字段来源。

替代方案：继续在 system prompt 中补充短兜底段落。该方案短期风险最低，但会继续放大 prompt 密度，且让业务输出实例变成通用 prompt 规则。因此不采用。

### Decision 2: `outputContracts` 作为模型可见业务输出能力清单

新增模型可见 `outputContracts` 数组，随 Planner user payload 一起发送。每个合同至少包含：

- `outputType`
- `schemaVersion`
- `description`
- `whenToUse`
- `whenNotToUse`
- `schemaSummary`
- `groundingRequirements`
- `validatorBoundary`
- `examples`

`visibleTrainingProposal` 的 `exercise_selection`、`routine`、`plan`、section coverage、`prescription`、`schedule`、`schemaVersion = "1"`、正文不能作为训练事实源等规则都由该 contract 承载。system prompt 只要求模型在输出 `visibleOutputs[]` 时选择并遵守当前可见 `outputContracts[]`。

替代方案：把 `outputContracts` 放到 tool manifest metadata。该方案会把“最终用户可见输出能力”误绑定到某个 tool，且在无 tool 或输出来自可消费 resource 时边界不清晰。因此不采用。

### Decision 3: failed / diagnostic 事实只支持恢复、澄清或 fallback，不支持成功 `final_answer`

模型可见合同需要统一表达：

- `ok=true` tool result 可以支撑普通事实解释，即使返回 0 条或候选不足。
- `failed` tool result、diagnostic resource、不可消费 resource 或 `satisfied=false` 结果不能支撑成功 `final_answer`。
- 如果当前目标仍可通过合法工具继续，应继续 `tool_call`。
- 如果缺少用户必要信息或需要用户放宽条件，应返回 `ask_user`，并可引用诊断事实。
- 如果 repair / runtime 已经不可恢复，应由 production terminal failure fallback / finalizer 生成用户安全回复。

替代方案：允许模型用 `final_answer` 解释失败。该方案会和现有 terminal grounding validator 产生边界张力，也容易让用户把失败解释理解成业务成功结果。因此不采用。

### Decision 4: 不可执行请求兜底集中为通用决策顺序

system prompt 保留一段短规则，表达能力边界决策顺序：

1. 不需要工具也能可靠回答的，返回 `final_answer`。
2. 缺少必要用户信息的，返回 `ask_user`。
3. 需要未注册能力的，不得 `tool_call`，不得承诺执行或保存；在未发生工具失败时可用 `final_answer` 说明能力边界和替代方向。
4. 已有 tool result 但事实不足时，优先继续合法 tool；不能继续时 `ask_user` 或交由失败 fallback 收口。

这段规则使用稳定 action / resource / grounding 抽象，不写具体用户短语、固定 toolName 或业务 outputType 触发条件。

### Decision 5: 测试转向结构化合同断言

实现时应更新测试：

- `agent-llm-prompt-config` 测试断言 system prompt 不再包含具体业务 output 的完整规则，但仍包含 `AgentAction`、tool loop、grounding 和不可执行能力边界。
- model input builder 测试断言 `outputContracts` 和 `tools` 并列进入 user payload。
- output contract 测试断言 `visibleTrainingProposal` 的 schema summary、examples、section coverage、`schemaVersion = "1"` 和 grounding 要求。
- fallback / repair 测试断言 failed / diagnostic 事实不会支撑成功 `final_answer`，而是进入 `ask_user`、repair 或 production fallback。
- 架构扫描断言没有新增服务端关键词、短语模板、用户原文路由或具体业务 `toolName` 语义分支。

### Decision 6: 新增 `actionContract`，把字段字典和 few-shot 从 system prompt 拆出

默认 system prompt 继续瘦身为最小系统约束：Planner 身份、JSON object 输出、三类 `AgentAction`、tool registry 边界、终态语义、grounding、安全边界和不可执行能力顺序。`AgentAction` 的最小形状、字段字典、`suggestedQuestions` 约束、`usedRefs` 形状、repair 规则和少量高价值 few-shot 由模型 user payload 中的 `actionContract` 承载。

这样处理后：

- 字段合法性仍由 Zod / validator 执行，不要求模型从长 prompt 猜 schema。
- 字段含义集中在 `actionContract.fieldDictionary`，避免在 system prompt、repair、examples 里重复解释。
- `ask_user` 只暴露唯一正确形状，不继续把旧字段黑名单写成 system prompt 主体。
- few-shot 使用稳定 action / resource / output contract 抽象，不使用用户 phrasing、关键词或具体业务 `toolName` 触发生产规则。

替代方案：继续把字段字典和 examples 放在 system prompt 中。该方案实现更小，但会让 system prompt 重新变成后端接口文档，因此不采用。

### Decision 7: `plan` 当前明确为单训练模板重复计划

`visibleTrainingProposal.payload.kind = "plan"` 当前采用 `one routine template + schedule`。也就是说，`payload.exerciseItems` 表达一个可重复训练模板，`schedule.assignments` 只安排周期内 `training` / `rest` 日。

当前 schema 不支持 `routines[]`、`schedule.assignments[].routineId` 或 A/B 多训练日模板。若后续要支持上肢 / 下肢 / 全身等多模板周期，应另起 output contract schema change，而不是让模型在现有 `schedule` 内嵌每天不同完整动作编排。

## Risks / Trade-offs

- [Risk] system prompt 瘦身后模型首轮缺少业务结构信息。→ Mitigation：`outputContracts` 必须进入首轮 Planner user payload，并由测试验证 `visibleTrainingProposal` 合同可见。
- [Risk] `outputContracts` 变成第二套 schema，和 terminal validator 漂移。→ Mitigation：优先从现有 Zod schema / validator 常量生成或集中维护 schema summary，测试同时覆盖 contract 与 validator。
- [Risk] prompt 文案测试大量失败。→ Mitigation：将长句 `toContain` 改为稳定结构和禁止项断言，不保留逐字文案依赖。
- [Risk] failed tool 后回复变得过于保守。→ Mitigation：区分 `ok=true` 空结果和 `failed` 结果；前者仍允许普通事实解释，后者只用于恢复、澄清或 fallback。
- [Risk] 新合同通道增加模型输入体积。→ Mitigation：`outputContracts` 必须是 schema summary 和少量 examples，不携带完整 handler output、完整数据库对象或大 payload。
- [Risk] `actionContract` 和 Zod schema 漂移。→ Mitigation：`actionContract` 只表达最小形状和字段字典，测试断言它与 `AgentAction` 主字段、旧字段禁止项和 adapter user payload 同步。

## Migration Plan

1. 新增 output contract 类型和集中配置，先只注册 `visibleTrainingProposal`。
2. 将 Planner user payload 扩展为包含 `outputContracts`。
3. 瘦身 system prompt，把业务输出细节迁移到 `visibleTrainingProposal` output contract。
4. 更新 repair / fallback 文案中 failed / diagnostic result 的 action 边界说明。
5. 更新相关测试和架构扫描。
6. 运行 OpenSpec、prompt/model input、Agent runtime、chat fallback、typecheck 和相关自动化测试。

## Open Questions

- `outputContracts` 的 schema summary 应完全手写，还是从 Zod schema 生成后再叠加中文业务说明？建议实现阶段优先集中配置，避免引入复杂生成器。
- 是否需要为 `outputContracts` 建 manifest hash / trace 快照？建议至少在模型请求 trace 中记录摘要和版本，完整 hash 可作为后续增强。
