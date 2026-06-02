## MODIFIED Requirements

### Requirement: 动作推荐必须由 Agent 执行结果触发

系统 SHALL 让动作推荐卡片由 Agent 工具调用和 `AgentExecutionResult` 触发，而不是由旧内部推荐事件、resolved intent 或 `workoutIntent` 触发。成功的推荐候选结果 SHALL 能稳定投影为 `exercise_recommendation` artifact 事件。

#### Scenario: 用户请求动作推荐
- **WHEN** Agent 判断本轮应返回动作推荐
- **THEN** Agent MUST 调用动作检索工具获得 candidateSetId 或等价候选集合
- **AND** 动作检索工具的用途 MUST 表达为 `candidateUse = "recommendation"` 或等价推荐候选用途
- **AND** `AgentExecutionResult` MUST 表达推荐结果或阻断原因
- **AND** 系统 MUST NOT 使用旧 `exercise_recommendation` intent 字段独立触发推荐卡片

#### Scenario: 推荐结果漏写 usedToolResultIds
- **WHEN** 本轮 Agent 成功调用 `searchExercises(candidateUse = "recommendation")`
- **AND** 最终 `AgentExecutionResult` 为 `answered`
- **AND** 最终结果没有引用该 tool result
- **THEN** 系统 MAY 基于本轮最后一个成功推荐候选工具结果投影 `exercise_recommendation` artifact
- **AND** 系统 MUST NOT 从用户原文、conversationSummary 或旧 intent 字段推断推荐卡片

#### Scenario: 候选不足
- **WHEN** 动作检索工具返回候选不足或无法满足约束
- **THEN** Agent MUST 返回澄清、blocked、failed 或可恢复建议
- **AND** 系统 MUST NOT 通过旧推荐事件展示未通过候选边界的卡片

#### Scenario: 工具 facet 可确定性规范化
- **WHEN** Agent 调用动作检索工具时传入的 target muscle 或 equipment 是动作库 facet 的常见短别名
- **THEN** 工具 MAY 将其规范化到动作库中真实存在的 facet 或 body region 展开结果
- **AND** 该规范化 MUST 只基于结构化工具入参和动作库 facet
- **AND** 系统 MUST NOT 基于用户原始文本执行意图改写、关键词分流或语义纠偏
