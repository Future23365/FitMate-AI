# ai-run-trace Specification

## Purpose
TBD - created by archiving change change-010-ai-trace-eval. Update Purpose after archive.
## Requirements
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

### Requirement: Trace 必须保护权限和隐私边界
系统 SHALL 在记录 trace 前执行权限和敏感字段边界控制。

#### Scenario: 工具读取 artifact payload
- **WHEN** `getArtifactPayload` 返回 artifact payload
- **THEN** trace MUST 只记录当前 `userId` 有权访问的结果
- **AND** trace MUST NOT 记录其他用户 artifact、session 或 schedule 的 payload

#### Scenario: trace 字段包含长文本或大 payload
- **WHEN** step input 或 output 超过系统配置的 trace 长度预算
- **THEN** 系统 MUST 截断或摘要化该字段
- **AND** trace MUST 保留足够定位问题的 code、id、状态和摘要信息

### Requirement: Trace 必须记录 stale artifact revision 解析
系统 SHALL 在受控 artifact payload 读取发生 revision 解析时，记录足够诊断 stale artifact id 的 trace 信息。

#### Scenario: 旧 artifactId 被解析到 active revision
- **WHEN** 受控工具读取 artifact payload 时将原始 artifactId 解析到不同的 active artifactId
- **THEN** trace 的 `tool_call` step MUST 记录原始 artifactId
- **AND** trace 的 `tool_call` step MUST 记录最终读取的 active artifactId
- **AND** trace MUST NOT 记录未授权 artifact payload

#### Scenario: revision 解析失败
- **WHEN** 受控工具无法将原始 artifactId 解析到可访问 active artifact
- **THEN** trace 的 `tool_call` step MUST 记录失败 code 和可诊断原因
- **AND** 用户可见回复 MUST 继续使用可恢复失败引导

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

