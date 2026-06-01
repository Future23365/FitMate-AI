## ADDED Requirements

### Requirement: 动作推荐必须由 Agent 执行结果触发
系统 SHALL 让动作推荐卡片由 Agent 工具调用和 `AgentExecutionResult` 触发，而不是由旧内部推荐事件、resolved intent 或 `workoutIntent` 触发。

#### Scenario: 用户请求动作推荐
- **WHEN** Agent 判断本轮应返回动作推荐
- **THEN** Agent MUST 调用动作检索工具获得 candidateSetId 或等价候选集合
- **AND** `AgentExecutionResult` MUST 表达推荐结果或阻断原因
- **AND** 系统 MUST NOT 使用旧 `exercise_recommendation` intent 字段独立触发推荐卡片

#### Scenario: 候选不足
- **WHEN** 动作检索工具返回候选不足或无法满足约束
- **THEN** Agent MUST 返回澄清、blocked、failed 或可恢复建议
- **AND** 系统 MUST NOT 通过旧推荐事件展示未通过候选边界的卡片

## REMOVED Requirements

### Requirement: 目标明确的动作推荐必须触发内部推荐事件

**Reason**: 内部推荐事件属于旧聊天动作触发架构。

**Migration**: 动作推荐由 Agent tool result 和 `AgentExecutionResult` 表达。

### Requirement: 动作候选不足时不得触发推荐事件

**Reason**: “推荐事件”已删除。

**Migration**: 候选不足必须作为 Agent tool result、blocking reason 或 failure handling suggestion 进入最终结果。

### Requirement: 动作推荐不得升级为单次训练编排

**Reason**: 行为边界仍重要，但不能以旧推荐 intent 表达。

**Migration**: Agent 根据用户语义和工具结果选择 `answered`、`generated`、routine draft 或澄清；测试断言最终 `AgentExecutionResult` 与用户可见结果一致。
