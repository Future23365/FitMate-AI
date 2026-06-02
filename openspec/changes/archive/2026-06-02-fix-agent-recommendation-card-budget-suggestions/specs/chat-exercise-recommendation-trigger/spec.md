## MODIFIED Requirements

### Requirement: 动作推荐必须由 Agent 执行结果触发
系统 SHALL 让动作推荐卡片由 Agent 工具调用和 `AgentExecutionResult` 触发，而不是由旧内部推荐事件、resolved intent 或 `workoutIntent` 触发。成功动作推荐 MUST 产生前端可消费的 `exercise_recommendation` artifact 事件，除非 Agent 返回澄清、blocked 或 failed。

#### Scenario: 用户请求动作推荐
- **WHEN** Agent 判断本轮应返回动作推荐
- **THEN** Agent MUST 调用动作检索工具获得 candidateSetId 或等价候选集合
- **AND** `AgentExecutionResult` MUST 表达推荐结果或阻断原因
- **AND** 系统 MUST NOT 使用旧 `exercise_recommendation` intent 字段独立触发推荐卡片

#### Scenario: 候选不足
- **WHEN** 动作检索工具返回候选不足或无法满足约束
- **THEN** Agent MUST 返回澄清、blocked、failed 或可恢复建议
- **AND** 系统 MUST NOT 通过旧推荐事件展示未通过候选边界的卡片

#### Scenario: 候选检索成功后展示推荐卡片
- **WHEN** Agent 使用 `searchExercises` 或等价工具成功获得用于推荐的候选集合
- **AND** 最终 `AgentExecutionResult` 引用了该工具结果
- **THEN** 服务端 MUST 基于该工具结果生成或投影 `exercise_recommendation` artifact payload
- **AND** `/api/chat` MUST 发送 `artifact_validated` 和 `artifact` 或等价结构化流事件
- **AND** 前端 MUST 能在当前 assistant bubble 中展示推荐卡片
- **AND** 服务端 MUST NOT 仅以纯文本 `answered` 回复吞掉可展示候选集合
