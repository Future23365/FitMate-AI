## ADDED Requirements

### Requirement: Trace 必须记录 LangChain Agent 执行证据
系统 SHALL 为生产 `/api/chat` 的 LangChain Agent Runtime 记录可复盘 trace。trace MUST 记录请求上下文、模型请求/响应摘要、DeepSeek native `tool_calls`、LangChain tool wrapper 执行、结构化 validator 和最终 NDJSON 投影。

#### Scenario: LangChain run 开始
- **WHEN** `/api/chat` 进入 LangChain Agent Runtime
- **THEN** trace MUST 记录 runId、userId、conversationId、responseMessageId、latestUserMessage 摘要和 model / tool catalog 摘要
- **AND** trace MUST 记录 LangChain runtime version 或等价实现标识
- **AND** trace MUST 记录 DeepSeek model、tool calling enabled 状态、预算和超时配置摘要
- **AND** trace MUST NOT 记录 API key、authorization、cookie、跨用户 payload 或未经脱敏的大 payload

#### Scenario: DeepSeek 返回 tool calls
- **WHEN** DeepSeek 响应包含 native `tool_calls`
- **THEN** trace MUST 记录 tool call id、tool name、arguments 安全摘要、provider status 和关联 model call id
- **AND** trace MUST 能定位每个 tool call 对应的 LangChain tool wrapper 执行结果
- **AND** trace MUST NOT 将 provider tool call 记录为已成功执行业务结果，除非 wrapper 已完成并通过校验

#### Scenario: LangChain tool wrapper 执行完成
- **WHEN** LangChain tool wrapper 成功、失败、被 policy 阻断或因 schema 拒绝而结束
- **THEN** trace MUST 记录 toolName、durationMs、input summary、output summary、failureCode、userId 隔离摘要和关键 resource id
- **AND** trace MUST 标记 tool result 是否进入后续模型上下文
- **AND** trace MUST NOT 保存完整敏感 handler output

#### Scenario: 终态响应投影完成
- **WHEN** production response adapter 输出 NDJSON 响应
- **THEN** trace MUST 记录输出事件类型摘要、content 长度、visible output 数量、suggestion 数量和错误 code
- **AND** trace MUST 能区分 LangChain 成功终态、结构化输出校验失败、tool wrapper 失败、provider 失败和配置失败

### Requirement: Trace 必须证明旧 Agent Core 缺席
系统 SHALL 在迁移后通过 trace 或架构扫描证明生产 `/api/chat` 未使用旧自研 Agent core。

#### Scenario: 生产聊天 trace 展示旧路径缺席
- **WHEN** trace 展示一次生产聊天请求
- **THEN** trace MUST 不再记录旧 `planner_action`、旧 `AgentAction`、旧 `ToolRegistry` manifest、旧 `runAgentRuntime` step 或旧 Response Renderer step
- **AND** trace SHOULD 记录 runtime family 为 LangChain 或等价标识

#### Scenario: 架构扫描验证旧 trace 字段缺席
- **WHEN** 本 change 完成实现
- **THEN** 自动化扫描 MUST 证明生产 trace 写入路径不再依赖旧 `AgentAction`、旧 `PlannerModelTraceEvent`、旧 `duplicate_tool_call` 或旧 resource refs 作为运行时合同

### Requirement: Trace 写入必须保持非致命
系统 SHALL 将 LangChain trace 观测视为开发诊断。trace 创建、step 写入、planner diagnostics 保存或摘要保存失败不得改变用户可见响应。

#### Scenario: trace step 写入失败
- **WHEN** model request、tool call、tool result 或 response projection trace 写入失败
- **THEN** `/api/chat` MUST 继续按 LangChain runtime 结果返回响应
- **AND** 系统 MUST 记录非致命开发诊断
- **AND** 系统 MUST NOT 因 trace 写入失败重试模型、重复执行 tool 或改写最终回答

## REMOVED Requirements

### Requirement: Trace 必须记录 Agent 执行证据和旧路径缺席
**Reason**: 该 requirement 绑定旧 Tool-first Agent、旧 AgentExecutionResult、旧 dependency graph 和旧 response writer。

**Migration**: 使用 LangChain run、DeepSeek `tool_calls`、LangChain tool wrapper 和 response adapter trace 证据替代。

### Requirement: Trace must record Agent loop model exchanges
**Reason**: 旧 Agent loop model exchange 已被 LangChain model invocation 替代。

**Migration**: 记录 LangChain model request / response、DeepSeek provider tool calls 和 LangChain run metadata。

### Requirement: Trace must link LLM decisions to tool execution results
**Reason**: 旧 decision / tool result 关联字段基于自研 loopTurnId、toolResultId 和 dependency graph。

**Migration**: 使用 provider tool call id、LangChain tool invocation id 和 wrapper result summary 建立关联。

### Requirement: Trace must support Agent loop diagnostics
**Reason**: 旧 diagnostics 围绕旧 Agent loop、AgentExecutionResult 和 Response Writer 不一致问题。

**Migration**: 新 diagnostics 围绕 LangChain run、provider tool calls、tool wrapper 校验、结构化 validator 和 response adapter 投影。

### Requirement: Trace 必须记录 Tool-first Agent 执行链路
**Reason**: 生产主链不再是 Tool-first 自研 Agent。

**Migration**: 使用 LangChain Agent Runtime trace requirement 替代。

### Requirement: Trace 必须记录 Agent 合同修复循环
**Reason**: 旧 repair loop 基于 `AgentAction` 合同失败。新链路不维护旧 action repair。

**Migration**: 记录 LangChain / provider / tool wrapper / structured output validator 的失败和恢复路径。
