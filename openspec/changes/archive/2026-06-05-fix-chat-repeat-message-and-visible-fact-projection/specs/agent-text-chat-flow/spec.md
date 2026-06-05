## MODIFIED Requirements

### Requirement: `/api/chat` 必须接入新 agent-core 文本聊天主链
系统 SHALL 使用新的 `agent-core` runtime 处理生产 `/api/chat` 的文本聊天请求，并输出 NDJSON 流式响应。该主链 MUST 复用服务端请求校验、当前用户身份和会话 hydration，但 MUST NOT 恢复旧 `AgentOrchestrator`、旧 `AgentExecutionResult`、旧 Response Writer 或旧兼容事件。

#### Scenario: 聊天请求进入文本 Agent 主链
- **WHEN** 已认证用户向 `/api/chat` 发送合法聊天请求
- **THEN** 系统 MUST 通过 `prepareChatRequest()` 或等价服务端流程归一化最新用户消息、会话 id、响应消息 id 和历史上下文
- **AND** 系统 MUST 构造 `AgentRunInput` 并调用新的 `runAgentRuntime()`
- **AND** 响应 MUST 使用 NDJSON stream 输出默认 Response Renderer 事件
- **AND** 系统 MUST NOT 返回 `chat_ai_disabled` 作为正常成功路径

#### Scenario: 已保存会话最后一条是同内容 user 时保持幂等
- **WHEN** `/api/chat` 请求携带 `conversationId` 和 `latestUserMessage`
- **AND** 服务端 hydration 恢复的 saved conversation 最后一条消息本身是同内容 `user`
- **THEN** `prepareChatRequest()` MUST NOT 再追加一条相同 user 消息
- **AND** 模型可见 `run.messages` MUST NOT 因同一次用户输入出现相邻重复 user 消息

#### Scenario: assistant 已回复后的同文本 user turn 不得被吞掉
- **WHEN** `/api/chat` 请求携带 `conversationId` 和 `latestUserMessage`
- **AND** 服务端 hydration 恢复的 saved conversation 中最近一条 user 消息内容与 `latestUserMessage` 相同
- **AND** saved conversation 最后一条消息是 `assistant`
- **THEN** `prepareChatRequest()` MUST 将 `latestUserMessage` 追加为新的 user turn
- **AND** 模型可见 `run.messages` 最后一条 MUST 是本次 user 消息
- **AND** 系统 MUST NOT 因文本内容相同而把已完成上一轮对话当作当前请求

#### Scenario: 聊天请求缺少模型配置
- **WHEN** `/api/chat` 无法构造生产 `LlmPlanner` 所需的 DeepSeek 配置
- **THEN** 系统 MUST 返回稳定的配置错误
- **AND** 错误 MUST 区分于模型输出非法、runtime 合同失败和旧 AI 运行时下线
