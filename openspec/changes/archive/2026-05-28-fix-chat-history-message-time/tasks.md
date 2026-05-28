## 1. 数据结构与服务端映射

- [x] 1.1 为前端 `ChatMessage` 增加可选 `createdAt`，并确保保存 payload 不丢失该字段
- [x] 1.2 调整 chat history 服务读取逻辑，返回每条消息 `createdAt`，并使用最后一条有效消息时间作为会话 `updatedAt`
- [x] 1.3 调整 chat history 服务保存逻辑，保留已有消息 `createdAt`，只为缺失时间的新消息生成稳定顺序时间

## 2. 前端历史加载与展示

- [x] 2.1 调整聊天控制器，避免加载历史会话后立即触发无内容变化的自动保存
- [x] 2.2 确认侧边栏历史列表继续按 `updatedAt` 展示和排序，但其来源已变为最后消息时间

## 3. 测试与验证

- [x] 3.1 补充 chat history 服务测试，覆盖消息时间映射、保存保留、fallback 和排序语义
- [x] 3.2 补充前端聊天历史工具测试，覆盖保存 payload 保留 `createdAt` 和事件派发
- [x] 3.3 运行 `openspec validate fix-chat-history-message-time --strict`
- [x] 3.4 运行 `npm test`、`npm run typecheck`、`npm run lint`
