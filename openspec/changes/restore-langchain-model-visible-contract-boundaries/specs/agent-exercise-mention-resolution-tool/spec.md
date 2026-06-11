## MODIFIED Requirements

### Requirement: `resolveExerciseResourceMentions` 必须提供安全投影和模型可见说明
系统 SHALL 为 `resolveExerciseResourceMentions` 提供中文模型可见说明、examples、model-visible summary、user projection 和 trace summary，且不得泄漏完整数据库记录或内部 handler output。模型可见内容 MUST 聚焦 mention 解析事实、候选状态、有限动作摘要和 diagnostics；MUST NOT 表达业务目标满足度，也 MUST NOT 指挥模型下一步必须调用某个具体业务 tool。

#### Scenario: 模型可见说明表达 mention 解析与下游使用
- **WHEN** Agent 构造 Planner 可见 tool manifest 或 tool result summary
- **THEN** `resolveExerciseResourceMentions` 的 description、schema description、examples 和 summary MUST 默认使用中文描述
- **AND** 说明 MUST 表达该 tool 只把模型结构化传入的用户点名动作文本解析为发布态 Exercise 候选
- **AND** 说明 MAY 表达 matched 或模型选择后的候选 id 可作为后续动作库查询、结构化输出或澄清的事实材料
- **AND** 说明 MUST 表达 `ambiguous` 代表存在多个候选事实，`not_found` 代表未解析为数据库动作事实
- **AND** 说明 MUST NOT 表达 `fulfillment`、`satisfied`、`supportsOutputKinds`、`finalAnswerSupport` 或等价业务满足度 / 输出可行性判断
- **AND** 说明 MUST NOT 表达 matched 结果必须继续调用 `searchExerciseResources`
- **AND** 说明 MUST NOT 表达 matched 结果已经生成最终 `visibleTrainingProposal`、routine、plan、训练卡片或保存结果

#### Scenario: observation 保留后续衔接边界但不指挥下一步
- **WHEN** model-visible summary 包含 matched、ambiguous 或 not_found 结果
- **THEN** summary MUST 表达有限候选摘要和 `allowedSections` 等可复核动作事实
- **AND** summary MAY 表达这些候选事实可被模型用于后续自主推理
- **AND** summary MUST NOT 要求固定下一步必须调用 `searchExerciseResources`
- **AND** summary MUST NOT 根据用户原文替模型决定是否澄清、重查、直接回答或提交结构化输出
- **AND** summary MUST NOT 包含 `nextActionHints`、`continue_tool_call`、`ask_user` 或等价下一步 action 枚举
