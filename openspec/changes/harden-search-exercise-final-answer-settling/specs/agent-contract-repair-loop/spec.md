## ADDED Requirements

### Requirement: 重复成功 tool 调用必须生成收口反馈
系统 SHALL 在同一 run 中识别重复的成功 tool 调用，并以结构化 `AgentDecisionFeedback` 引导 Planner 基于已有成功结果收口或提交新的合法 action，而不是再次执行同一 handler 或耗尽 repair 预算。

#### Scenario: 已有同等成功结果时重复调用
- **WHEN** Planner 返回 `tool_call`
- **AND** 当前 run 已存在相同 `toolName + toolVersion + normalizedInputHash` 的 tool result
- **AND** 该既有 tool result 满足 `ok = true`
- **AND** 该既有 tool result 满足 `fulfillment.satisfied = true`
- **THEN** runtime MUST NOT 再次执行相同 tool handler
- **AND** runtime MUST 生成结构化 `AgentDecisionFeedback`
- **AND** feedback MUST 引用既有成功 `toolResultId`
- **AND** feedback MUST 说明 Planner 可以基于既有结果输出合法 terminal action，或提交改变后的合法 tool input

#### Scenario: 重复成功反馈不替代语义判断
- **WHEN** runtime 生成重复成功 tool call feedback
- **THEN** feedback MUST NOT 根据用户原文关键词、正则、同义词表或短句模板判断用户是否要求刷新、更多结果或排除已展示动作
- **AND** feedback MUST NOT 代替 Planner 生成用户可见回答内容
- **AND** feedback MUST NOT 改写 Planner 的高层语义 action

#### Scenario: 改变后的合法 input 不触发重复成功反馈
- **WHEN** Planner 返回相同 toolName 的 `tool_call`
- **AND** input 与既有成功结果的 normalized input 不同
- **THEN** runtime MUST 按正常 Action Validator、budget 和 Executor 流程处理该 tool call
- **AND** runtime MUST NOT 仅因 toolName 相同就阻止执行

#### Scenario: 未满足结果不使用重复成功反馈
- **WHEN** 当前 run 只有相同 `toolName + toolVersion + normalizedInputHash` 的 failed、diagnostic 或 `fulfillment.satisfied = false` 结果
- **THEN** runtime MUST NOT 将该结果当作成功收口依据
- **AND** runtime MUST 继续使用既有失败反馈、重复失败熔断、澄清或 failed 收口边界

