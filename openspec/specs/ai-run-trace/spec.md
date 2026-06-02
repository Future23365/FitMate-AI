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

### Requirement: Trace 必须记录 Agent decision JSON 恢复证据
系统 SHALL 在 Agent decision 模型输出发生 JSON 格式恢复时记录可诊断 trace，使开发者能区分严格解析失败、非语义格式恢复、恢复后 schema 失败和最终执行结果。

#### Scenario: Agent decision JSON 恢复成功
- **WHEN** Agent decision 模型响应严格 JSON 解析失败，但非语义 JSON 格式恢复成功
- **THEN** trace MUST 记录原始解析失败 code 和错误详情
- **AND** trace MUST 记录恢复方式、恢复后的 parse status 和模型阶段
- **AND** trace MUST 记录恢复后的 decision action、toolName 或 final result status

#### Scenario: Agent decision JSON 恢复后继续执行工具
- **WHEN** 恢复后的 Agent decision 通过 Schema、registry 和工具输入校验
- **THEN** trace MUST 能关联恢复后的 decision step、后续 tool call、tool result 和 dependency graph
- **AND** trace MUST 保留原始模型响应摘要，便于确认恢复没有改变语义字段

#### Scenario: Agent decision JSON 恢复失败
- **WHEN** Agent decision 模型响应无法恢复为唯一合法 JSON object
- **THEN** trace MUST 继续记录 `invalid_json` 或等价失败 code
- **AND** trace MUST 记录失败边界为 `agent_tool_decision`
- **AND** trace MUST NOT 标记为已恢复

### Requirement: Trace 必须记录 Agent artifact revision 恢复
系统 SHALL 在 Agent 工具读取 artifact payload 或基于 artifact 生成 routine 时记录 requested/active artifact revision 关系。

#### Scenario: Agent 工具恢复 artifact revision
- **WHEN** Agent 工具将 requested artifact id 恢复到不同的 active artifact id
- **THEN** trace MUST 记录 requested artifact id
- **AND** trace MUST 记录 active artifact id
- **AND** trace MUST 记录 revision resolution 状态
- **AND** trace MUST NOT 记录未授权 payload

### Requirement: Trace 必须记录重复工具失败熔断
系统 SHALL 在 Agent runtime 熔断重复不可重试工具失败时记录可诊断证据。

#### Scenario: 重复工具失败被熔断
- **WHEN** runtime 因相同工具和相同归一化输入已有不可重试失败而阻止再次执行工具
- **THEN** trace MUST 记录 duplicate failure code
- **AND** trace MUST 记录原始失败 tool result id
- **AND** trace MUST 记录重复次数或等价计数
- **AND** trace MUST 能区分真实底层工具执行失败和 runtime 熔断

### Requirement: Trace 必须记录 Tool-first Agent 执行链路

系统 SHALL 为 Tool-first Agent 主链记录可复盘 trace，覆盖 Agent 状态、工具决策、工具执行、校验、写入和最终回复。

#### Scenario: Agent run 开始
- **WHEN** `/api/chat` 进入 AgentOrchestrator
- **THEN** trace MUST 记录 `agent_run_started` 或等价 step
- **AND** step MUST 包含 runId、userId、sessionId、messageId、latestUserMessage、ContextPackage 摘要、recent artifact 摘要和工具版本
- **AND** step MUST 记录 context provenance、截断策略和是否存在可选 ContextSnapshot

#### Scenario: LLM 决定调用工具
- **WHEN** LLM 在 Agent loop 中选择工具
- **THEN** trace MUST 记录 `agent_tool_decision`
- **AND** step MUST 包含 toolName、参数摘要、选择原因、step index 和模型信息
- **AND** step MUST NOT 包含敏感认证信息或未经摘要的大 payload

#### Scenario: 工具执行完成
- **WHEN** Agent 工具执行成功或失败
- **THEN** trace MUST 记录 `agent_tool_result`
- **AND** step MUST 包含工具名称、状态、耗时、输入摘要、输出摘要、失败 code、toolResultId 和候选或资源 id 摘要
- **AND** step MUST 记录 candidateSetId、artifactPayloadId、validationId、policyDecisionId、confirmationId 或 revisionId 等可关联 id

#### Scenario: Agent 完成本轮
- **WHEN** Agent 产出 `AgentExecutionResult`
- **THEN** trace MUST 记录 `agent_final_result`
- **AND** finalDecision MUST 能区分 answered、needs_clarification、generated、patched、failed 和 blocked
- **AND** trace MUST 能关联最终回复使用了哪些 tool result

#### Scenario: Agent 模型调用与预算观测
- **WHEN** `/api/chat` 执行 Agent 主链中的模型调用
- **THEN** trace MUST 记录 Agent prompt module、模型阶段、ContextPackage 可见性摘要、tool result 可见性摘要、截断策略和 token 使用
- **AND** 阶段名称 MUST 能表达 `agent_context_build`、`agent_tool_decision`、`agent_tool_execution`、`agent_response_writer`、`agent_summary_update` 或等价 Agent 阶段
- **AND** trace MUST NOT 将 `/api/chat` 主链描述为 summary-only、intent-first 或旧只读 tool loop 决策链

#### Scenario: Agent 输出解析失败
- **WHEN** Agent decision、final result 或 Response Writer 的模型输出解析失败、Schema 失败、未知工具、非法参数或 repair 失败
- **THEN** trace MUST 记录失败 code、模型阶段、输入摘要、输出摘要和恢复路径
- **AND** trace MUST 能区分失败后进入 blocked、failed、needs_clarification 或 retry/repair

#### Scenario: 旧路径防回归
- **WHEN** 本轮 Agent 执行完成
- **THEN** trace MUST 能标识是否调用了旧 intent-first 分支、旧 normalize、旧只读 trigger matrix、summary-only 上下文或 ReferenceResolver-first 主路径
- **AND** 自动化测试 MUST 能断言生产主链没有依赖这些旧路径触发执行结果

#### Scenario: Replay fixture
- **WHEN** 系统生成 Agent replay fixture
- **THEN** fixture MUST 包含 ContextPackage 摘要、tool decision、tool result、dependency graph、AgentExecutionResult 和 Response Writer 输入摘要
- **AND** fixture MUST 不包含敏感认证信息或未经摘要的大 payload
- **AND** fixture MUST 足以复盘最终 artifact 事件为何出现或为何被阻断

