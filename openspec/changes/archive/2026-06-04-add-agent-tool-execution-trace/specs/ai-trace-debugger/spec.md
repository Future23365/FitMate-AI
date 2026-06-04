## MODIFIED Requirements

### Requirement: Tool execution is linked to model decisions
`/dev/ai-traces` SHALL link each Agent tool execution to the LLM decision that requested it and to the later Agent result that consumed it.

#### Scenario: 查看 tool 执行结果
- **WHEN** Agent loop turn 包含 tool decision 和 tool result
- **THEN** 页面 MUST 在同一轮展示 toolName、toolCallId、toolResultId、输入摘要、输出摘要、状态、耗时和失败 code
- **AND** 页面 MUST 展示 candidateSetId、artifactId、validationId、policyDecisionId、confirmationId、revisionId 或其他 resource id 的产生位置（如果存在）
- **AND** 页面 MUST 展示该 tool result 是否被下一轮 LLM 输入、Agent final result、validator、policy、persistence 或 Response Writer 消费
- **AND** 页面 MUST 将通用 `tool_execution` runtime event 展示为可展开的 tool step，包含 Input、Output、Metadata 和 Raw JSON 入口

#### Scenario: 保存全链路 log 包含 tool 执行证据
- **WHEN** 开发者点击保存全链路 log
- **THEN** 导出的 `codex_logs/ai_trace_log.js` MUST 包含逐 tool 的 execution step 或等价 runtime event
- **AND** 导出内容 MUST 包含 toolName、toolResultId、input summary、output summary、status、durationMs 和 failureCode
- **AND** 导出内容 MUST NOT 包含完整 handler output、权限 token、cookie、API key 或未脱敏大 payload
