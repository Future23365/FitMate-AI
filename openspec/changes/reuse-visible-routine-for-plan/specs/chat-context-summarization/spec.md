## ADDED Requirements

### Requirement: 当前 run 最新用户消息必须覆盖旧上下文摘要
系统 SHALL 在构造生产 Agent 模型可见上下文时确保本轮真实最新用户消息优先进入当前 run 的上下文事实摘要。Saved `conversationContext` MAY 提供长期事实，但 MUST NOT 覆盖本轮 `request.latestUserMessage` 或基于当前 raw messages 得到的低歧义当前事实。

#### Scenario: saved context 不覆盖最新用户输入
- **WHEN** `/api/chat` 使用 saved conversation hydration
- **AND** saved `conversationContext.knownFacts.latestUserMessage` 与本轮 `request.latestUserMessage` 不一致
- **THEN** 传给 Agent 的 `internalConversationContext.knownFacts.latestUserMessage` MUST 使用本轮最新用户消息
- **AND** 模型可见上下文 summary MUST 优先反映本轮最新用户消息

#### Scenario: 保留长期事实但更新当前事实
- **WHEN** saved `conversationContext` 包含长期器械、限制、偏好或避免项
- **AND** 当前 raw messages 提供新的 `latestUserMessage`、低歧义周频或周期天数事实
- **THEN** hydration MUST 保留 saved context 中未被当前 run 明确更新的长期事实
- **AND** hydration MUST 使用当前 raw messages 更新 `latestUserMessage`、周频或周期天数等当前 run 事实
- **AND** hydration MUST NOT 基于这些字段替模型决定 `toolName`、`payload.kind` 或最终回复策略

#### Scenario: 不从摘要触发执行链
- **WHEN** 当前 run 的上下文事实摘要被传给 Agent
- **THEN** `/api/chat`、Agent runtime、tool handler 和 validator MUST NOT 仅因 `knownFacts.latestUserMessage`、周频或周期天数存在而启动训练生成、动作查询、保存或结构化推送
- **AND** 执行策略 MUST 继续由模型基于当前 messages、模型可见上下文和 tool result 推理完成
