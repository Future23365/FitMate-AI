## ADDED Requirements

### Requirement: Trace 必须记录 Agent 执行证据和旧路径缺席
系统 SHALL 在 `/api/chat` trace 中记录 Tool-first Agent 的执行证据，并明确证明旧 intent-first 路径、旧只读 tool loop、summary-only 上下文和旧兼容事件没有参与生产执行。

#### Scenario: Agent run 完成
- **WHEN** `/api/chat` 完成一次 Agent run
- **THEN** trace MUST 记录 `agent_context_build`、`agent_tool_decision`、`agent_tool_execution`、`agent_final_result`、`agent_response_writer` 或等价阶段
- **AND** trace MUST 记录 `AgentExecutionResult.status`、使用的 tool result id、candidateSetId、validationId、policyDecisionId、revisionId 和最终用户可见投影摘要

#### Scenario: 旧路径未参与执行
- **WHEN** trace 展示一次生产聊天请求
- **THEN** trace MUST 记录旧 intent resolution、resolved intent repair、`runReadonlyToolLoop`、旧 ReferenceResolver-first 主路径和旧 `assistant_action` 生产输出均未参与执行
- **AND** 旧路径缺席证据 MUST 可被自动化测试读取

#### Scenario: Agent-only failure handling 发生
- **WHEN** Agent 进入 repair、tool retry、clarification、blocked、failed、validation / policy failure handling 或用户确认路径
- **THEN** trace MUST 记录失败来源、失败边界、使用的 tool result 或 blocking reason
- **AND** trace MUST 记录本次失败处理没有调用旧 intent-first 架构、旧只读 tool loop 或 summary-only payload reconstruction

## MODIFIED Requirements

### Requirement: AI 编排必须记录基础 AiRunTrace
系统 SHALL 为关键 AI 编排请求记录 `AiRunTrace`，使开发者能复盘 Agent 输入、工具调用、依赖图和最终执行结果。

#### Scenario: 聊天请求触发 AI 编排
- **WHEN** `/api/chat` 触发 Agent 编排、工具调用、Patch、训练卡片生成、澄清或受控写入
- **THEN** 系统 MUST 创建包含 `runId`、`userId`、`sessionId`、`messageId` 和 `createdAt` 的 trace
- **AND** trace MUST 记录模型、Agent prompt version、tool registry version 和 tool versions
- **AND** trace MUST 记录本轮 `latestUserMessage`
- **AND** trace MUST 记录当前 run 使用的 `ContextPackage` 摘要和 artifact 摘要，而不是无权限的大 payload 集合

#### Scenario: AI 编排完成
- **WHEN** AI 编排流程完成或失败
- **THEN** trace MUST 记录 `AgentExecutionResult` 或标准化失败结果
- **AND** trace MUST 能区分成功、需要澄清、policy blocked、可恢复失败和硬失败

## REMOVED Requirements

### Requirement: Trace step 必须覆盖第一批架构关键节点

**Reason**: 该 requirement 以 Artifact、ReferenceResolver、Patch 和旧阶段命名为中心，不能表达当前 Agent dependency graph。

**Migration**: 使用 Agent context、tool decision、tool execution、dependency graph、validator / policy / persistence 和 response writer 阶段。

### Requirement: Trace 必须记录 LLM 只读工具决策

**Reason**: 独立只读 tool loop 已删除。

**Migration**: Trace 记录 Agent tool decision，包含读工具和受控写工具的统一决策证据。

### Requirement: Trace 必须记录只读工具执行结果

**Reason**: 只读工具执行结果不再归属独立 loop。

**Migration**: Trace 记录所有 Agent tool call 和 tool result，并区分 read / write / validation / policy / persistence。

### Requirement: Trace 必须记录只读 tool loop 回退

**Reason**: 旧只读 loop 的失败处理会调用已废弃的固定编排路径。

**Migration**: Agent 工具失败、预算耗尽和解析失败统一记录为 Agent blocked、failed、needs_clarification 或 failure handling result。

### Requirement: Trace 必须记录只读 tool loop 成本和延迟

**Reason**: 成本观测应覆盖完整 Agent run，而不是只读 loop。

**Migration**: Trace 记录 Agent 各阶段模型调用次数、工具调用次数、耗时、step limit、timeout 和 token budget 使用情况。
