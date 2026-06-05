## Context

当前 `/api/chat` production text chat 已接入 `agent-core`、production `ToolRegistry`、`LlmPlanner` 和默认 NDJSON Response Renderer。默认 renderer 在 `AgentRunResult.terminalError` 存在时输出 `error` 事件，并把内部 message 脱敏成通用“聊天生成失败，请稍后重试。”。前端在收到未知错误 code、stream parse error 或 HTTP error 时也会映射到同一句通用文案。

最新 trace 说明本次不是服务端 route 直接 500，也不是模型没有返回。链路中 `inspectVisibleTrainingProposals` 和 `searchExerciseResources` 均成功且 `satisfied=true`，Planner 随后输出 `final_answer.visibleOutputs[]`，但 `payload.kind = "routine"` 只包含 `training` 动作，把 warmup / stretch 写在正文建议里。`visibleTrainingProposal` validator 正确拒绝该输出，repair 后仍重复失败，runtime 最终以 `repair_limit_exceeded` 收口。

本 change 同时处理两个层面：

1. 用户体验层：Agent terminal failure 不能让用户看到不可恢复的“聊天生成失败”死路文案。
2. 合同恢复层：routine / plan section 覆盖失败要给模型足够结构化 repair 信息，促使它继续获取缺失 section、输出可支撑结构、澄清或安全失败收口。

## Goals / Non-Goals

**Goals:**

- 为 production text chat 建立统一的用户可见 terminal failure 投影，避免 chat bubble 或错误区展示“聊天生成失败，请稍后重试。”。
- 将 terminal failure 用户文案按稳定错误事实分类，例如配置不可用、unsupported capability、结构化训练输出未通过校验、预算/超时、未知异常。
- 保留内部 trace 诊断，确保 `repair_limit_exceeded`、`terminal_reference_invalid`、`section_coverage_missing`、validator details 和 runtime step 可排查。
- 补强 `visibleTrainingProposal` section coverage repair 信息，使模型知道当前可见事实覆盖哪些 section、缺少哪些 section、可以采取哪些恢复方向。
- 明确抽象层级门禁：具体 trace、用户原话、业务 tool 名和字段组合只能进入证据或回归测试，不得进入服务端语义分流规则。

**Non-Goals:**

- 不新增业务 tool，不改变 `ToolRegistry` 的能力面。
- 不恢复旧 `AgentOrchestrator`、旧 `assistant_action`、旧 `intent_resolved` 或旧 card trigger。
- 不在 `/api/chat` route 或 chat service 中新增基于用户自然语言的关键词、正则、同义词、短句模板或业务 intent 分流。
- 不降低 `visibleTrainingProposal` validator 的强校验要求；无效 routine / plan 仍不得渲染、保存或写入历史事实。
- 不为了兜底额外发起第二次 LLM 请求。fallback 文案由服务端基于稳定错误事实投影为安全 assistant response，避免模型不可用、超时或再次违反合同时继续失败。

## Decisions

### Decision 1: 在 production chat adapter 建立错误分类投影，而不是修改 core runtime 语义

`agent-core` 的职责是执行 planner loop、校验 action、执行 tool、收集 trace 和返回结构化 `AgentRunResult`。用户可见中文文案属于 production `/api/chat` adapter 和前端消费边界，不应塞进 runtime 主循环。

实现时应新增或整理一个稳定的 terminal failure projection helper，输入只允许来自确定性事实：

- `result.status`
- `result.terminalError.code`
- `result.terminalError.details`
- validation details 中的稳定 code，例如 `section_coverage_missing`
- registry/tool capability 状态
- repair / budget trace event

输出是用户安全的 `content` / `assistant_suggestions` / `done`，或配置/传输类错误的安全 `error`。不得读取用户原文决定文案类别，不得根据某个 `toolName` 语义解释用户意图。

备选方案是改 `agent-core/response-renderer.ts` 默认 renderer，把所有 terminal error 都改成 `content`。不采用：默认 renderer 是通用安全边界，测试和开发态 runtime 仍需要稳定 `error` 事件；production `/api/chat` 可以在 adapter 层覆盖用户体验，但不改变 core 的通用语义。

### Decision 2: 对可恢复 terminal failure 输出 assistant response，不输出死路 error

对于下列失败，production chat 应优先输出安全 `content` 事件并给出可恢复建议：

- `repair_limit_exceeded` 且最近 validation / details 指向 terminal output validation、terminal reference invalid、visible output coverage failure。
- `terminal_reference_invalid` 且可归因于模型引用不可消费 resource、未满足 tool result 或无效 visible output。
- `budget_exhausted`、`max_steps_exceeded`、`overall_timeout` 等可让用户通过简化问题恢复的失败。
- unsupported capability 类失败继续使用已有 unsupported fallback 口径，但文案应避免承诺未接入能力。

示例类别：

- 训练结构未通过校验：说明这次没有生成可验证的训练方案，不能展示不可靠结果；建议改成动作建议、放宽条件，或让系统先补充热身/拉伸候选。
- 能力未接入：说明当前还不能直接执行该操作，建议换成普通训练问题或补充信息。
- 服务暂不可用：说明聊天服务暂时不可用，稍后再试。
- 超时/预算：说明本次信息量或步骤过多，建议缩小范围。

这些文案是安全投影，不是内部 validator message 的原样透传。trace 中仍保留真实错误 code 和 details。

### Decision 3: section coverage repair 只表达合同缺口，不替模型指定固定 tool

本次 trace 的具体失败是 `routine` 缺少 `warmup` / `stretch`。正确抽象类型是“visible output 结构覆盖不足”，不是“用户说从中挑 5 个动作时必须怎样”。

repair feedback / observation 应表达：

- 输出的 `payload.kind`。
- `exerciseItems` 已覆盖 section。
- `routine` / `plan` 缺少哪些必要 section。
- 当前 run 可见事实覆盖哪些 section。
- 可恢复方向：继续获取缺失 section 的可消费动作事实、输出当前事实可支撑结构、向用户澄清或安全失败收口。

feedback 不得包含：

- 固定用户短句触发条件。
- “必须调用某个具体 tool”的硬规则。
- 服务端根据用户原文改写 action、tool、payload.kind 或最终回复策略。

业务名 `visibleTrainingProposal`、`searchExerciseResources`、`inspectVisibleTrainingProposals` 只能出现在业务 tool manifest、observation projection、resource contract、validator diagnostics 或回归测试中，不作为通用 prompt 触发语。

### Decision 4: 前端保留防线，但主要收口在后端

后端应尽量把已知 terminal failure 投影成 `content`，这样用户看到的是普通 assistant message，而不是页面级错误提示。前端仍应保留：

- HTTP / stream / NDJSON 解析错误的安全中文兜底。
- 未知 error event code 的安全中文兜底。
- abort / timeout 的明确文案。

同时，前端不应原样展示 `event.error.message`，也不应因为后端已做投影而删除安全兜底。最终目标是用户可见文案不再出现“聊天生成失败，请稍后重试。”这种不可恢复死路，而不是把内部错误细节展示出来。

## Risks / Trade-offs

- [Risk] 过宽的 terminal failure fallback 可能掩盖真实 bug。
  Mitigation: trace、runtime result、test diagnostics 必须继续记录原始 code、details 和 response projection type；测试覆盖每个分类。

- [Risk] 把所有失败都说成“功能不支持”会误导用户。
  Mitigation: 文案按错误事实分类；结构校验失败说“未生成可验证方案”，能力缺口才说“当前不支持该操作”。

- [Risk] 后端安全文案变成新的语义路由。
  Mitigation: 分类输入只允许 runtime / validator / registry / budget 等确定性事实；tasks 中加入抽象层级门禁和 architecture scan。

- [Risk] repair budget 仍可能不足以让模型补齐 section。
  Mitigation: 本 change 不直接调大预算；先补诊断质量和失败投影。后续若真实黑盒仍反复失败，再基于 token / latency 证据单独评估预算配置。

- [Risk] 默认 renderer 和 production adapter 的错误行为变成两套。
  Mitigation: 明确默认 renderer 保持通用 `error` 边界；production adapter 只做用户体验投影，并通过 tests 覆盖两者关系。

## Abstraction Gate

结论：可继续。

1. 抽象问题类型：terminal visible output validation failure、resource coverage / grounding repair 不足、用户可见错误投影不可恢复。
2. 通用合同修复：基于 runtime status、terminal error code、validation details、repair budget 和 resource coverage 做安全投影与 repair feedback，不使用用户短句作为触发条件。
3. 业务 tool 局部说明：`visibleTrainingProposal`、`searchExerciseResources`、`inspectVisibleTrainingProposals` 只作为业务 tool / resource / validator / observation 合同和测试样例出现。
4. 回归测试样例：保留“从上一轮动作中组成 30 分钟训练”这类 trace 样例，并增加等价语义变体，例如“把上次那批动作编成一次训练课”；测试样例不得反向决定生产规则。
5. 服务端语义分流检查：本 change 不新增关键词规则、自然语言模板路由、phrasing 特判或具体 `toolName` 语义分支。
