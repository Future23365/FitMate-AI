## Context

当前生产 Planner 请求由 `DeepSeekModelAdapter` 构造：`system` message 只包含 `buildAgentActionSystemPrompt()`，`user` payload 中并列放入 `actionContract`、`run`、`step`、`tools`、`outputContracts`、`observations` 和 `toolResults`。这比早期长 system prompt 更清晰，但仍然把稳定协议和当前事实放在同一优先级的 JSON 数据里。

近期 ToolManifest 瘦身已经把三类业务 tool 的 examples 改为完整 `tool_call AgentAction`，并把全局 grounding / resource glossary 收敛到 `actionContract`。剩余问题集中在四处：

- `actionContract` 和 `outputContracts` 仍作为 `user` payload 数据传入，长上下文下模型可能忽略其协议优先级。
- repair 仍通过 `invalid_action` observation 回到同一个 planning prompt，没有独立 repair-only 指令。
- `visibleOutputContract.examples` 中部分 `expectedAction` 仍是自然语言字符串，和真实 `AgentAction` 形态不一致。
- production tool 的 `toModelObservation` 仍包含较长边界说明和下一步建议，容易重新制造 ToolManifest 瘦身前的上下文负担。

本 change 属于模型可见合同治理。设计基准来自 `docs/llm-prompt-guidance.md`：Prompt 定策略，Schema 定形状，Glossary 定概念，Tool 定能力，Runtime 给事实，Validator 守边界，Repair 修错误。

## Goals / Non-Goals

**Goals:**

- 将 Planner 输入拆成稳定协议层和当前事实层，降低模型把协议当普通数据处理的概率。
- 将 repair 语境从正常 planning prompt 中独立出来，只在存在非法 action 和 validator details 时出现。
- 统一所有模型可见 action 示例：字段名叫 `expectedAction` 或 `examples[].action` 时必须是完整 action object。
- 收紧 `inspectVisibleTrainingProposals.read_recent.ref` 的模型可见来源说明，使其只指向本轮 `list_recent` 返回值。
- 将 production observations 从“长规则说明”收敛为结构化事实摘要、事实等级、缺口字段和诊断 code。
- 保持服务端语义中立，不新增关键词、正则、短句模板、自然语言路由或具体业务 `toolName` 分支。

**Non-Goals:**

- 不改变 `/api/chat` 外部请求 / 响应事件协议。
- 不新增、删除或重命名业务 tool。
- 不修改数据库 schema、Prisma model、权限隔离或事实存储结构。
- 不让服务端根据用户原文选择 tool、operation、`payload.kind` 或 final answer 策略。
- 不用真实模型黑盒结果作为自动化测试的唯一验收标准；自动化先验证模型可见合同和 deterministic runtime 边界。

## Decisions

### 1. 引入 Planner 模型输入 envelope，而不是继续扩写 user payload

设计一个 adapter 内部使用的模型输入分层对象，例如：

- `protocol`: 稳定协议层，包含 `actionContract`、glossary、Planner policy、output contract 摘要、schema version 和 prompt version。
- `context`: 当前 run 事实层，包含 `run`、`step`、`tools`、`observations`、`toolResults` 和必要 metadata。
- `repairContext`: 可选 repair 层，只在上一轮 action 非法且仍有 repair 预算时存在。

`DeepSeekModelAdapter` 可以把 `protocol` 渲染进单个 `system` message，也可以在供应商支持时拆成更细 message；但 `user` payload 不再平铺长期协议和当前事实。这样既保持 adapter 负责供应商协议映射，又不让 `agent-core` 依赖 DeepSeek message 格式。

替代方案是只在 `systemPromptInstructions` 增加一句“user payload 里的 actionContract 优先级更高”。这仍然把协议作为 user 数据传入，不能解决层级问题，因此不采用。

### 2. Repair 通过显式 `repairContext` 进入 adapter

runtime 在 validation failure 后继续沿用现有 repair budget 和 invalid action observation，但需要额外构造一个脱敏 `repairContext`：

- `failedAction`: 上一轮模型输出的安全摘要或完整可安全序列化 action。
- `error`: validator 返回的 code、message 和结构化 details。
- `errors[]`: schema projector 或 domain validator 提供的字段路径、expected、actual、allowedFields、requiredFields、allowedValues。
- `facts`: 与修复相关的当前 run tool result / resource 摘要。

adapter 只有在 `repairContext` 存在时才追加 repair-only 指令。repair 指令只允许局部修正上一轮 action，不重新规划用户目标、不引入新事实、不编造 id、不扩大任务范围。事实不足时模型可以移除结构化输出、`ask_user` 或失败收口。

替代方案是继续把 repair 规则放进 `actionContract.repairPolicy`。该方案比过去轻，但 repair 仍污染正常 planning，因此只保留少量“正常首轮不要预设 repair”的边界，不承载 repair 操作说明。

### 3. Output contract 示例区分 action 和 decision

`AgentVisibleOutputContractExample` 需要把示例字段语义拆开：

- `expectedAction`: 完整 `AgentAction` object，用于展示模型最终可输出形态。
- `expectedDecision`: 中文自然语言决策说明，用于表达“应继续 tool_call / ask_user / 失败收口”等策略，但不得伪装成 action。

测试必须禁止 `expectedAction` 为 string。这样与 `ToolExample.action` 和 `actionContract.examples.expectedAction` 的语义保持一致。

替代方案是保留 string 并在 description 中解释它不是 action。字段名已经叫 `expectedAction`，这会继续训练模型接受半截或非 JSON action，因此不采用。

### 4. `read_recent.ref` 来源说明只暴露模型需要知道的边界

handler 可以继续通过当前 run diagnostic resource 校验 `ref.value` 是否来自本轮 `list_recent`，但 schema description / manifest / examples 只告诉模型：

- `list_recent` 不需要 `ref`。
- `read_recent.ref.value` 只能复制本轮 `list_recent` 返回的 `factRef` 或 `messageId`。
- 没有真实返回值时先 `list_recent`、澄清或失败收口，不能编造。

不再把 `diagnostic index resource` 作为模型可见输入来源写进 schema description。它是 runtime 校验实现，不是 Planner 应主动选择的输入来源。

### 5. Observation 投影用结构化事实摘要替代长规则块

production tool 的 `toModelObservation` 保留当前 run 决策必需事实：

- `status`
- `factLevel`
- `fulfillment.satisfied`
- `availableSections`
- `missingSectionsForRoutineOrPlan`
- `supportsOutputKinds`
- `querySpecificity`
- `diagnostics[]`
- `groups.<section>.exercises[]` 的有限动作事实
- `terminalUsedRef` 或 resource ref 摘要

移除或压缩这些内容：

- 重复全局禁止项。
- 长篇 `allowedNextActions`。
- 固定下一步 tool flow 暗示。
- 与当前 observation 无关的 validator 或 output contract 长说明。

如果需要表达可恢复下一步，用枚举或短字段表达，例如 `nextActionHints: ["continue_tool_call", "ask_user", "final_answer_without_visible_outputs"]`。这些 hint 只能是可选恢复出口，不得包含具体用户短语或强制具体 `toolName`。

### 6. 抽象层级门禁

本 change 的业务名只允许出现在对应局部层：

- `inspectVisibleTrainingProposals`、`searchExerciseResources`、`resolveExerciseResourceMentions`: tool manifest、schema description、observation projection 和测试。
- `visibleTrainingProposal`: output contract、resource contract、validator details 和测试。
- 通用 prompt / runtime: 只表达 `AgentAction`、resource、tool result、repair、grounding 和 clarification 等稳定抽象。

禁止将用户短句、trace 个例、具体字段组合或具体 `toolName` 写入服务端 runtime 语义分支。

## Risks / Trade-offs

- Risk: 把协议移入 system message 后 prompt 体积上升。Mitigation：system 只承载稳定摘要，不复制完整 tool schema；tool schema 仍在当前 context 中按 manifest 暴露。
- Risk: `repairContext` 引入新的 adapter 输入形态，可能影响 fake adapter / tests。Mitigation：先扩展模型无关 `ModelActionCompletionInput`，再由 DeepSeek adapter 映射；fixture adapter 用最小字段覆盖。
- Risk: observation 过度瘦身导致模型缺少恢复依据。Mitigation：保留结构化缺口字段、诊断 code、事实等级和 `supportsOutputKinds`，并补回归测试验证 routine / plan 缺 section 时仍能继续合法 action。
- Risk: `expectedAction` 字段重命名影响现有测试。Mitigation：迁移时用类型和测试阻止 string action；自然语言说明迁入 `expectedDecision`。
- Risk: active OpenSpec change 之间存在 prompt 合同重叠。Mitigation：本 change 只追加分层、repair 和 observation 要求，不重写已有 `slim-agent-tool-manifests` 的核心 manifest 合同。

## Migration Plan

1. 先新增模型输入 envelope 类型和 adapter request body 测试，保持 runtime 行为不变。
2. 接入 `repairContext`，让 validation failure 后的下一轮请求带 repair-only prompt；首轮请求保持无 repair 指令。
3. 迁移 output contract examples，补类型和测试阻止 string `expectedAction`。
4. 收紧 `inspectVisibleTrainingProposals.read_recent.ref` schema description / manifest tests。
5. 分阶段瘦身三个 production tool 的 model observations，先保证测试覆盖事实字段没有丢失，再删长规则。
6. 跑相关 Agent prompt / tool / runtime 测试和 `npm run typecheck`。

回滚策略：如果新 envelope 影响真实模型稳定性，可以在 adapter 配置层临时回退到旧 request body builder；但类型和测试应保留，直到明确决定取消该分层方案。

## Open Questions

无需要先阻塞实现的问题。实现时只需根据 DeepSeek 当前 message 能力决定 `protocol` 是单独 system message 还是拼入现有 system content。
