# agent-runtime-resource-contract Specification

## Purpose
TBD - created by archiving change stabilize-agent-runtime-resource-contract. Update Purpose after archive.
## Requirements
### Requirement: Agent runtime 必须区分可消费资源和诊断资源
Agent runtime SHALL 将本轮 tool result 明确分为可消费成功资源、诊断资源和 partial 资源。只有成功、满足履约要求且不是反馈型结果的 tool result MAY 作为后续工具依赖；失败、`satisfied=false`、partial 或 feedback 型 tool result SHALL 只能作为解释、澄清、阻断或失败诊断证据。

#### Scenario: 成功工具结果成为可消费资源
- **WHEN** Agent tool result 的 `status = "success"`
- **AND** 该结果不是 feedback 型结果
- **AND** 该结果的 `fulfillment.satisfied` 不是 `false`
- **THEN** runtime MUST 将该 tool result 登记为 `consumable`
- **AND** 后续工具 MAY 通过该结果产生的 `candidateSetId`、`draftId`、`validationId`、`policyDecisionId`、`revisionId` 或等价资源 id 继续执行

#### Scenario: 失败工具结果成为诊断资源
- **WHEN** Agent tool result 的 `status = "failed"`
- **THEN** runtime MUST 将该 tool result 登记为 `diagnostic`
- **AND** 后续生成、校验、保存或写入工具 MUST NOT 将该 tool result 当作成功依赖
- **AND** `answered`、`blocked`、`failed` 或 `needs_clarification` 终止结果 MAY 引用该 tool result 说明阻断原因

#### Scenario: Partial candidate 不可用于生成
- **WHEN** `searchExercises` 返回候选非空但 `resultRequirements` 未满足的 partial candidate set
- **THEN** runtime MUST 将该结果登记为诊断资源
- **AND** runtime MUST NOT 将该 `candidateSetId` 加入可消费 candidate set 集合
- **AND** `generateRoutineDraft`、`generatePlanDraft` 或 `proposeWorkoutPatch` 引用该 `candidateSetId` 时 MUST 被拒绝

### Requirement: Final result 引用校验必须按终止状态分层
系统 SHALL 根据 `AgentExecutionResult.status` 校验 `usedToolResultIds` 和结构化资源引用。成功写入类终止结果 MUST 只引用可消费 producer；解释、澄清、阻断和失败类终止结果 MAY 引用诊断资源作为证据。

#### Scenario: generated 只能引用可消费 producer
- **WHEN** Agent 返回 `AgentExecutionResult.status = "generated"`
- **THEN** runtime MUST 校验 `revisionId`、`validationId`、`policyDecisionId` 和 `usedToolResultIds` 来自当前 run 的可消费 producer
- **AND** runtime MUST reject 引用 failed、partial 或 feedback 型 tool result 的 generated 结果

#### Scenario: needs_clarification 可以引用诊断资源
- **WHEN** Agent 返回 `AgentExecutionResult.status = "needs_clarification"`
- **AND** 结果引用本轮 failed 或 partial tool result
- **THEN** runtime MUST accept 这些引用作为诊断证据
- **AND** Response Writer MUST NOT 将这些诊断引用当作训练已生成或已保存的证据

#### Scenario: blocked 和 failed 可以引用失败工具结果
- **WHEN** Agent 返回 `blocked` 或 `failed`
- **AND** `usedToolResultIds` 包含本轮已登记的 failed tool result
- **THEN** runtime MUST allow 这些引用作为阻断或失败说明
- **AND** trace MUST 标明这些 tool result 是 diagnostic 而不是 consumable

### Requirement: askClarification 必须稳定收口为 needs_clarification
系统 SHALL 将成功执行的 `askClarification` 视为澄清终止信号，并稳定生成 `AgentExecutionResult.status = "needs_clarification"` 或要求模型返回等价结构化终止结果。

#### Scenario: askClarification 成功后直接澄清
- **WHEN** Agent 成功调用 `askClarification`
- **THEN** runtime MUST 能从工具输出投影 `needs_clarification`
- **AND** 投影结果 MUST 包含 `question`、`assistantSuggestions` 和 `blockingReasons`
- **AND** 用户可见回复 MUST 展示该澄清问题而不是通用失败文案

#### Scenario: 模型把澄清包装为 answered
- **WHEN** 最新成功工具结果是 `askClarification`
- **AND** 模型随后返回普通 `answered` 且内容表达等待用户确认
- **THEN** runtime MUST normalize 或 project 为 `needs_clarification`
- **AND** runtime MUST NOT 因引用 failed / partial 诊断结果而返回 `model_output_invalid`

### Requirement: Agent trace 必须展示资源角色
Agent trace SHALL 记录每个 tool result 在当前 run 中的资源角色，帮助开发者区分模型可见证据、可消费依赖、诊断证据和 partial candidate。

#### Scenario: 记录资源角色
- **WHEN** runtime 记录 `agent_tool_result`
- **THEN** trace metadata MUST 包含该结果的资源角色
- **AND** 对 partial candidate MUST 记录 `unmetResultRequirements`
- **AND** 对 diagnostic result MUST 记录其是否允许被 `needs_clarification`、`blocked` 或 `failed` 引用

#### Scenario: 记录最终引用分类
- **WHEN** runtime 记录 `agent_final_result`
- **THEN** trace metadata MUST 区分 `usedConsumableToolResultIds` 和 `usedDiagnosticToolResultIds`
- **AND** trace MUST 能说明 final result 是否因非法引用被拒绝、被投影为澄清、或成功收口

