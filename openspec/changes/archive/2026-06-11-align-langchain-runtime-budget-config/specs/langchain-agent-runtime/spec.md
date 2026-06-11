## ADDED Requirements

### Requirement: LangChain graph step 预算必须与模型调用预算同步
系统 SHALL 将传给 LangChain agent 的 `recursionLimit` 视为 graph step 预算，而不是旧自研 Agent 的迭代次数。`recursionLimit` MUST 由集中配置中的真实模型调用预算推导，且 MUST 为工具调用后的最终结构化回答预留 graph step 空间。

#### Scenario: 工具调用后仍可提交最终回答
- **WHEN** LangChain runtime 的集中配置允许 N 次模型调用
- **AND** 模型在前 N-1 次调用中持续返回合法 provider `tool_calls`
- **THEN** runtime MUST 为第 N 次模型调用提交 `fitmate_final_response` 保留 LangChain graph step 预算
- **AND** runtime MUST NOT 因旧 `maxIterations + 2` 计算提前触发 `budget_exhausted`

#### Scenario: 模型调用预算耗尽
- **WHEN** LangChain runtime 即将发起超过集中配置 `maxModelCalls` 的 provider model call
- **THEN** runtime MUST 停止继续调用 provider
- **AND** runtime MUST 返回稳定 `budget_exhausted` 失败
- **AND** trace summary MUST 保留已经发生的 model call、provider tool call 和 tool execution 摘要

#### Scenario: 业务 tool 预算不包含 activity report
- **WHEN** 模型调用 `reportAgentActivity`
- **THEN** 该调用 MUST 只消耗 activity report 预算、模型调用预算和 LangChain graph step 预算
- **AND** 该调用 MUST NOT 消耗业务 tool 调用预算
- **AND** runtime MUST 继续限制 activity report 次数，防止模型刷屏或空转
