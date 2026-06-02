## ADDED Requirements

### Requirement: Trace must record Agent loop model exchanges
系统 SHALL 为 Tool-first Agent loop 中每一次 LLM 调用记录可复盘的模型输入、模型输出、解析结果和关联标识。

#### Scenario: Agent loop 发送模型请求
- **WHEN** Agent loop 调用 LLM 进行 tool decision、final result、Response Writer 或等价模型阶段
- **THEN** trace MUST 记录 `model_request` step
- **AND** step MUST 包含 model、messages、response_format、thinking、promptModules、aiStage、loopTurnId 或等价 turn index
- **AND** step MUST 包含本轮模型可见的 ContextPackage 摘要、registered tools 摘要、visibleToolResultIds、dependency graph 摘要和 remainingSteps
- **AND** step MUST 不记录 API key、authorization、cookie、跨用户 payload 或未经脱敏的大 payload

#### Scenario: Agent loop 收到模型回复
- **WHEN** Agent loop 收到 LLM 回复
- **THEN** trace MUST 记录 `model_response` step
- **AND** step MUST 包含 content 或 rawResponse 摘要、tokenUsage、status、loopTurnId 或等价 turn index
- **AND** step MUST 记录解析后的 action、toolName、tool input 摘要、reason、AgentExecutionResult、usedToolResultIds 或 parsing failure
- **AND** 解析失败时 step MUST 记录失败 code、错误详情和可恢复路径

### Requirement: Trace must link LLM decisions to tool execution results
系统 SHALL 用结构化 id 连接 LLM tool decision、tool execution result、后续 LLM 输入和最终 AgentExecutionResult。

#### Scenario: LLM 决定调用工具
- **WHEN** LLM 在 Agent loop 中选择工具
- **THEN** trace MUST 记录 tool decision 的 loopTurnId、modelCallId、toolCallId、toolName、输入摘要、reason 和 step index
- **AND** trace MUST 能从该 decision 定位到对应的 tool result

#### Scenario: Tool 执行完成
- **WHEN** Agent tool 执行成功、失败或被跳过
- **THEN** trace MUST 记录 `agent_tool_result` 或等价 step
- **AND** step MUST 包含 loopTurnId、toolCallId、toolResultId、toolName、status、durationMs、输入摘要、输出摘要和 failureCode
- **AND** step MUST 包含 candidateSetId、artifactId、validationId、policyDecisionId、confirmationId、revisionId 或其他关键 resource id 摘要

#### Scenario: Tool result 进入下一轮模型输入
- **WHEN** 后续 Agent loop model request 可见某个已登记 tool result
- **THEN** trace MUST 在 model_request metadata 或 input 摘要中记录 visibleToolResultIds
- **AND** trace MUST 能证明该 tool result 已进入下一轮 LLM 输入
- **AND** 如果 tool result 未进入后续 LLM 输入但被最终结果使用，trace MUST 记录该使用路径

### Requirement: Trace must support Agent loop diagnostics
系统 SHALL 记录足够诊断 Agent loop 断链、无效输出和用户可见回复不一致的信息。

#### Scenario: Tool decision 和 tool result 断链
- **WHEN** trace 中存在 tool decision 但没有对应 tool result
- **THEN** trace MUST 保留 decision 的 modelCallId、toolCallId、toolName、输入摘要和错误状态
- **AND** trace MUST 记录断链原因或可诊断 failureCode

#### Scenario: Tool result 未被消费
- **WHEN** tool result 已产生但没有被后续 model request、Agent final result、validator、policy、persistence 或 Response Writer 引用
- **THEN** trace MUST 保留该 toolResultId、产生 step、输出摘要和 orphaned 状态
- **AND** trace MUST NOT 通过用户文本或 step title 推断消费关系

#### Scenario: 最终回复与 AgentExecutionResult 不一致
- **WHEN** Response Writer 的用户可见回复承诺了未执行的生成、修改、保存、确认或 tool 结果
- **THEN** trace MUST 保留 AgentExecutionResult、Response Writer 输入摘要、用户可见回复摘要和缺失的 resource id 或 toolResultId
- **AND** trace MUST 将该问题标记为 response writer boundary diagnostic

## MODIFIED Requirements

### Requirement: Trace 必须记录 Agent 执行证据和旧路径缺席
系统 SHALL 在 `/api/chat` trace 中记录 Tool-first Agent 的执行证据，并明确证明旧 intent-first 路径、旧只读 tool loop、summary-only 上下文和旧兼容事件没有参与生产执行。

#### Scenario: Agent run 完成
- **WHEN** `/api/chat` 完成一次 Agent run
- **THEN** trace MUST 记录 `agent_context_build`、`agent_tool_decision`、`agent_tool_execution`、`agent_final_result`、`agent_response_writer` 或等价阶段
- **AND** trace MUST 记录每一轮 LLM 输入、LLM 输出解析、tool decision、tool result、下一轮 prompt 可见性和最终结果引用
- **AND** trace MUST 记录 `AgentExecutionResult.status`、使用的 tool result id、candidateSetId、validationId、policyDecisionId、revisionId 和最终用户可见投影摘要
- **AND** trace MUST 能关联最终回复使用了哪些 tool result、resource id 和 AgentExecutionResult 字段

#### Scenario: 旧路径未参与执行
- **WHEN** trace 展示一次生产聊天请求
- **THEN** trace MUST 记录旧 intent resolution、resolved intent repair、`runReadonlyToolLoop`、旧 ReferenceResolver-first 主路径和旧 `assistant_action` 生产输出均未参与执行
- **AND** 旧路径缺席证据 MUST 可被自动化测试读取

#### Scenario: Agent-only failure handling 发生
- **WHEN** Agent 进入 repair、tool retry、clarification、blocked、failed、validation / policy failure handling 或用户确认路径
- **THEN** trace MUST 记录失败来源、失败边界、使用的 tool result 或 blocking reason
- **AND** trace MUST 记录本次失败处理没有调用旧 intent-first 架构、旧只读 tool loop 或 summary-only payload reconstruction
