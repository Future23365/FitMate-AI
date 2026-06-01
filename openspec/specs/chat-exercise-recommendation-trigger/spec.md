# chat-exercise-recommendation-trigger Specification

## Purpose
TBD - created by archiving change allow-goal-only-exercise-recommendation. Update Purpose after archive.
## Requirements
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

