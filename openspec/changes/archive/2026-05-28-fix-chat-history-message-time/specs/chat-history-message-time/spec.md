## ADDED Requirements

### Requirement: History time comes from latest chat message
系统 SHALL 使用会话中最后一条 `user` 或 `assistant` 消息的 `createdAt` 作为聊天历史的展示时间和排序时间。

#### Scenario: User opens chat history list
- **WHEN** 系统读取聊天历史列表
- **THEN** 每条历史记录的 `updatedAt` MUST 等于该会话最后一条有效聊天消息的 `createdAt`
- **AND** 历史列表 MUST 按该时间倒序排列

#### Scenario: Conversation has no message timestamp
- **WHEN** 会话没有可用的消息 `createdAt`
- **THEN** 系统 MUST fallback 到 `ChatSession.updatedAt`

### Requirement: Message timestamps are preserved
系统 SHALL 在聊天历史读写过程中保留每条消息的 `createdAt`，避免保存旧会话时改写历史消息时间。

#### Scenario: Existing conversation is saved again
- **WHEN** 客户端保存包含 `createdAt` 的历史消息
- **THEN** 服务端 MUST 使用原消息 `createdAt` 写回 `ChatMessage.createdAt`
- **AND** 服务端 MUST NOT 将已有消息时间替换为保存发生时刻

#### Scenario: New message is saved
- **WHEN** 客户端保存缺少 `createdAt` 的新消息
- **THEN** 服务端 MUST 为该消息生成新的 `createdAt`
- **AND** 同一批新消息 MUST 保持可预测的先后顺序

### Requirement: Loading history does not touch conversation time
系统 SHALL 避免仅加载历史会话触发无内容变化的保存。

#### Scenario: User selects an existing history item
- **WHEN** 用户点击历史记录并加载该会话
- **THEN** 客户端 MUST NOT 因 state 回填立即调用保存接口
- **AND** 历史记录展示时间 MUST 保持为最后一条用户或 AI 消息时间

#### Scenario: User continues an existing conversation
- **WHEN** 用户在已加载的历史会话中发送新消息或触发新的 AI 回复
- **THEN** 客户端 MUST 正常保存会话
- **AND** 历史记录展示时间 MUST 更新为新增聊天消息的 `createdAt`
