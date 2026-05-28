## ADDED Requirements

### Requirement: Chat history message time coverage
项目 MUST 为聊天历史消息时间语义补充自动化测试，覆盖服务端映射、保存保留和前端保存 payload 行为。

#### Scenario: Chat history service preserves message time
- **WHEN** 测试套件运行
- **THEN** chat history 服务测试 MUST 覆盖从数据库消息 `createdAt` 映射到前端消息
- **AND** 测试 MUST 覆盖保存历史会话时保留已有消息 `createdAt`
- **AND** 测试 MUST 覆盖缺失消息时间时为新消息生成稳定顺序的时间

#### Scenario: Chat history list uses latest message time
- **WHEN** 测试套件运行
- **THEN** chat history 服务测试 MUST 覆盖列表返回和排序使用最后一条用户或 AI 消息时间
- **AND** 测试 MUST 覆盖没有可用消息时间时 fallback 到 `ChatSession.updatedAt`

#### Scenario: Chat client saves message time
- **WHEN** 测试套件运行
- **THEN** 前端聊天历史工具测试 MUST 覆盖保存 payload 会保留已有消息 `createdAt`
- **AND** 测试 MUST 覆盖保存后仍派发 `fitmate:chat-history-updated`
