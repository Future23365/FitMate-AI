## ADDED Requirements

### Requirement: 新 agent-core 文本聊天必须投影 AgentRunResult trace
系统 SHALL 将新 `agent-core` 文本聊天运行产生的 `AgentRunResult.traceEvents` 投影到开发态 `AiTrace`。投影 MUST 使用字段白名单、脱敏和截断，不得把完整 tool output、secret、cookie、authorization 或跨用户 payload 写入 trace。

#### Scenario: Agent run 输入被记录
- **WHEN** `/api/chat` 构造 `AgentRunInput` 并进入文本聊天 runtime
- **THEN** trace MUST 记录 `runId`、当前 `userId`、`conversationId`、`responseMessageId`、最新用户消息摘要和 hydration 摘要
- **AND** trace MUST 记录当前 registry 为空或等价 tool count
- **AND** trace MUST NOT 记录认证 cookie、API key、authorization header 或未经摘要的大 payload

#### Scenario: runtime traceEvents 被记录
- **WHEN** `runAgentRuntime()` 返回 `AgentRunResult`
- **THEN** trace MUST 记录 `registry_snapshot`、`budget_event`、`planner_action`、`validation_result`、`terminal_grounding`、`policy_decision`、`resource_registered` 或等价 runtime event 的安全摘要
- **AND** 每个 runtime event 摘要 MUST 保留 event type、step、action type、toolName、budget、status、code 或可诊断 id 中适用的字段
- **AND** trace MUST NOT 通过用户文本或 step title 推断不存在的 tool 消费关系

#### Scenario: terminal action 和错误被记录
- **WHEN** `AgentRunResult` 以 completed、needs_input、requires_confirmation 或 failed 结束
- **THEN** trace MUST 记录 runtime status、terminal action type、terminal error code、steps 和 replay summary 中的安全摘要
- **AND** failed trace MUST 能定位失败边界是配置、planner、runtime validation、budget、unknown tool 还是 response projection

#### Scenario: 响应投影被记录
- **WHEN** 系统将 `AgentRunResult` 投影为 NDJSON 事件
- **THEN** trace MUST 记录真实返回事件的类型列表、最终文本摘要、建议回复数量、错误 code 和 `done` 是否输出
- **AND** trace 中的响应摘要 MUST 来自同一份即将返回给前端的事件数组

#### Scenario: trace 字段超出预算
- **WHEN** trace input、output、metadata 或 error 字段包含长文本或大对象
- **THEN** 系统 MUST 截断或摘要化该字段
- **AND** trace MUST 保留足够定位问题的 code、id、状态和摘要信息

### Requirement: 文本聊天 trace 必须证明旧路径未参与
系统 SHALL 在新 `agent-core` 文本聊天 trace 中记录当前生产链路边界，证明旧 intent-first、旧只读 tool loop、旧 `agent-orchestrator` 和旧兼容事件没有参与本轮执行。

#### Scenario: 文本聊天 trace 标记当前链路
- **WHEN** `/api/chat` 完成一次文本聊天 run
- **THEN** trace MUST 记录本轮使用的是 `agent-core` 文本聊天接入、空 `ToolRegistry` 和默认 Response Renderer
- **AND** trace MUST 标记旧 `agent-orchestrator`、旧 `assistant_action`、旧 `intent_resolved` 和旧业务 card event 未参与当前响应

#### Scenario: 架构扫描验证旧路径缺席
- **WHEN** 本 change 完成实现
- **THEN** 自动化测试 MUST 证明 `/api/chat` 和文本聊天接入服务没有导入旧 `agent-orchestrator`
- **AND** 自动化测试 MUST 证明 route 没有通过关键词、正则、同义词或业务 toolName 分支选择执行路径
