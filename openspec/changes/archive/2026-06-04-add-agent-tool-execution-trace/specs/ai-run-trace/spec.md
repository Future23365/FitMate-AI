## ADDED Requirements

### Requirement: 新 agent-core trace 必须记录 tool 执行事件
系统 SHALL 为每一次通过 Runtime / Executor 执行的 Agent tool 记录通用 `tool_execution` trace event，作为模型决策、执行结果、资源登记和最终回答之间的可复盘证据。

#### Scenario: 记录成功 tool 执行
- **WHEN** Runtime 校验 `tool_call`、Policy Guard 允许执行，并完成 `executeTool()`
- **THEN** trace MUST 记录 `tool_execution` event
- **AND** event MUST 包含 `step`、`toolName`、`toolVersion`、`toolCallId`、`toolResultId`、`normalizedInputHash`、`inputSummary`、`ok`、`satisfied`、`fulfillment`、`projectionSummary`、`startedAt`、`completedAt` 和 `durationMs`
- **AND** event MUST 关联 produced / consumed resource refs（如果存在）
- **AND** event MUST NOT 包含完整 handler output、未脱敏敏感字段、数据库内部对象或 API credential

#### Scenario: 记录失败 tool 执行
- **WHEN** `executeTool()` 返回失败、output schema 校验失败、handler 失败、timeout、abort 或 resource contract validation 失败
- **THEN** trace MUST 记录 `tool_execution` event
- **AND** event MUST 包含失败后的最终 `toolResultId`、`toolName`、`ok = false`、`satisfied = false`、`failureCode` 和已脱敏错误摘要
- **AND** event MUST 保留 input hash 和 input summary，便于判断是否是重复输入或 schema 边界问题

#### Scenario: 重复失败熔断不再次调用 handler
- **WHEN** Runtime 因重复非重试 tool 失败触发 duplicate failure fuse
- **THEN** trace MUST 记录 `tool_execution` event
- **AND** event MUST 标记该结果来自 duplicate failure fuse 或等价 reason
- **AND** event MUST NOT 伪装为 handler 已重新执行

#### Scenario: confirmation resume 执行 tool
- **WHEN** confirmation resume 读取服务端保存的 pending `tool_call` 并执行 tool
- **THEN** trace MUST 记录 `tool_execution` event
- **AND** event MUST 使用服务端 pending action 的 input summary，而不是客户端重传的新 input
