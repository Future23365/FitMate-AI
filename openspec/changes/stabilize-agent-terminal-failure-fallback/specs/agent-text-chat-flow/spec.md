## MODIFIED Requirements

### Requirement: 默认 Response Renderer 必须输出聊天可消费的 NDJSON 事件

系统 SHALL 使用默认 Response Renderer 或 production chat adapter 将 `AgentRunResult` 投影为前端可消费的 NDJSON 事件。用户可见事件 MUST 来自 runtime terminal action、tool result 的安全投影、production adapter 的安全 terminal failure 投影或结构化错误，不得由 LLM 直接生成。

#### Scenario: 文本回答流式输出
- **WHEN** Runtime 以 `final_answer` 结束
- **THEN** 响应 MUST 至少输出一个 `content` 事件和一个 `done` 事件
- **AND** `content` MUST 来自已校验 terminal action

#### Scenario: 可恢复 terminal failure 流式输出
- **WHEN** Runtime 因 terminal output validation、terminal reference、repair budget 耗尽、预算耗尽或等价 Agent terminal failure 而结构化失败
- **AND** production chat adapter 能基于稳定错误事实归类该失败
- **THEN** 响应 MAY 输出用户安全 `content` 事件和 `assistant_suggestions` 事件
- **AND** 响应 MUST 输出 `done` 事件
- **AND** 用户可见事件 MUST NOT 原样包含内部 `terminalError.message`、validator details、provider 原文或 stack
- **AND** trace MUST 记录该响应是 terminal failure fallback projection，而不是 runtime 成功的 `final_answer`

#### Scenario: 未分类错误流式输出
- **WHEN** Runtime 因模型输出非法、未知工具、预算耗尽、planner 失败或其他结构化失败而无法被 production chat adapter 安全归类为用户可恢复内容
- **THEN** 响应 MUST 输出脱敏 `error` 事件和 `done` 事件
- **AND** `error` 事件 MUST 使用脱敏后的错误信息
- **AND** 前端 MUST 将该 error code 映射为稳定中文安全文案，不得展示内部 message

#### Scenario: 不输出旧兼容事件
- **WHEN** `/api/chat` 返回文本聊天 NDJSON
- **THEN** 响应 MUST NOT 输出旧 `assistant_action`、旧 `intent_resolved`、旧 `agent_execution_result` 或旧 card trigger 事件
- **AND** 前端 MUST NOT 依赖这些旧事件展示本轮文本回复
