## ADDED Requirements

### Requirement: Trace 必须记录 Tool-first Agent 执行链路

系统 SHALL 为 Tool-first Agent 主链记录可复盘 trace，覆盖 Agent 状态、工具决策、工具执行、校验、写入和最终回复。

#### Scenario: Agent run 开始
- **WHEN** `/api/chat` 进入 AgentOrchestrator
- **THEN** trace MUST 记录 `agent_run_started` 或等价 step
- **AND** step MUST 包含 runId、userId、sessionId、messageId、latestUserMessage、recent artifact 摘要和工具版本

#### Scenario: LLM 决定调用工具
- **WHEN** LLM 在 Agent loop 中选择工具
- **THEN** trace MUST 记录 `agent_tool_decision`
- **AND** step MUST 包含 toolName、参数摘要、选择原因、step index 和模型信息
- **AND** step MUST NOT 包含敏感认证信息或未经摘要的大 payload

#### Scenario: 工具执行完成
- **WHEN** Agent 工具执行成功或失败
- **THEN** trace MUST 记录 `agent_tool_result`
- **AND** step MUST 包含工具名称、状态、耗时、输入摘要、输出摘要、失败 code 和候选或资源 id 摘要

#### Scenario: Agent 完成本轮
- **WHEN** Agent 产出 `AgentExecutionResult`
- **THEN** trace MUST 记录 `agent_final_result`
- **AND** finalDecision MUST 能区分 answered、needs_clarification、generated、patched、failed 和 blocked
- **AND** trace MUST 能关联最终回复使用了哪些 tool result

