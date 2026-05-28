## Why

当前聊天历史侧边栏使用 `ChatSession.updatedAt` 作为展示和排序时间，点击旧历史会触发前端自动保存并刷新 `updatedAt`，导致历史记录时间变成当前点击时间。历史记录应反映最后一条用户问题或 AI 回复的消息时间，而不是会话被读取或无内容变化写回的时间。

## What Changes

- 聊天消息结构补充稳定的 `createdAt` 字段，并在服务端读取、保存和回放时保留该时间。
- 历史列表的展示和排序时间改为最后一条用户或 AI 消息的 `createdAt`，仅在缺少消息时间时 fallback 到会话 `updatedAt`。
- 加载历史会话后避免立即触发无内容变化的自动保存，防止读取行为更新数据库时间。
- 补充聊天历史服务和客户端保存行为相关测试，覆盖消息时间保留与历史排序时间语义。

## Capabilities

### New Capabilities
- `chat-history-message-time`: 覆盖聊天历史展示时间、排序时间和消息创建时间保留规则。

### Modified Capabilities
- `test-coverage`: 补充聊天历史时间语义相关测试要求。

## Impact

- 影响 `features/chat/types.ts`、`features/chat/lib/chat-history.ts`、`features/chat/hooks/use-chat-controller.ts`、`components/app/app-sidebar.tsx`。
- 影响 `lib/server/chat/chat-history-service.ts` 和 `/api/chat/conversations` 返回的数据结构。
- 影响聊天历史服务测试、可能新增前端聊天历史工具测试。
