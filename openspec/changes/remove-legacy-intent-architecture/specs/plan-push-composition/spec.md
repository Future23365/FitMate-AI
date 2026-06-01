## ADDED Requirements

### Requirement: 长期计划推送必须服从 Agent 执行结果
系统 SHALL 让长期计划推送服从 Tool-first Agent 的结构化结果。长期计划生成请求 MUST 来自 Agent 已登记的 plan draft / edit plan / candidate set / validation / policy 输入，而不是旧 resolved intent。

#### Scenario: Agent 要求生成长期计划
- **WHEN** `AgentExecutionResult` 或 Agent tool result 表示本轮应生成长期计划
- **THEN** 长期计划生成流程 MUST 使用 Agent 提供的结构化计划输入、candidateSetId、用户约束、字段来源和 tool result ids
- **AND** 系统 MUST NOT 从旧 `workoutIntent`、`action.kind` 或回复正文重新判断是否生成 plan

#### Scenario: Agent 要求澄清或阻断
- **WHEN** Agent 返回 `needs_clarification`、`blocked` 或 `failed`
- **THEN** 系统 MUST NOT 调用长期计划生成流程
- **AND** 前端 MUST NOT 展示长期计划生成中的加载状态

#### Scenario: 计划草稿与 Agent 输入冲突
- **WHEN** 计划草稿的周期、周频、训练日数量、时长或器械条件与 Agent 结构化输入冲突
- **THEN** 系统 MUST 拒绝将该草稿作为成功计划返回
- **AND** 系统 MUST 进入 Agent recovery、重新校验、重新生成或澄清路径

## REMOVED Requirements

### Requirement: 长期计划推送必须服从 resolved intent

**Reason**: 长期计划不再由旧 resolved intent 驱动。

**Migration**: 长期计划推送服从 Agent tool results、plan draft input、validation / policy result 和 `AgentExecutionResult`。

### Requirement: 长期计划推送不得用默认周期覆盖 resolved intent 约束

**Reason**: resolved intent 字段来源不再是计划约束来源。

**Migration**: 默认周期、周频率和时长必须服从 Agent plan input 或 tool result 的字段来源，并在 validation 中可追踪。
