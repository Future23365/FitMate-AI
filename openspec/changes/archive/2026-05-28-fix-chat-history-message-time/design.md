## Context

聊天历史侧边栏当前从 `/api/chat/conversations` 读取 `ChatConversation.updatedAt` 并用于展示和排序。服务端将该字段映射为 `ChatSession.updatedAt`，而 Prisma schema 中 `ChatSession.updatedAt` 使用 `@updatedAt`。当用户点击历史记录时，聊天页加载消息后会更新本地 state，随后自动保存 effect 会把旧会话再次写入服务端，导致 `ChatSession.updatedAt` 变成点击时刻。

当前 `ChatMessage` 前端类型没有 `createdAt`，服务端保存时也会删除原消息并按当前时间重建 `ChatMessage.createdAt`。因此仅把侧边栏改为读取最后一条消息时间并不足够，必须先让消息时间在读写之间保持稳定。

## Goals / Non-Goals

**Goals:**
- 历史记录的展示时间和排序时间来自最后一条有效聊天消息，而不是会话元数据更新时间。
- 读取旧历史不会触发一次无内容变化的保存。
- 保存旧会话时保留已有消息的 `createdAt`，新消息才生成新的 `createdAt`。
- 保持现有聊天卡片 metadata、`conversationContext` 和用户隔离语义不变。

**Non-Goals:**
- 不新增数据库表或迁移。
- 不改变聊天消息内容、AI 编排、训练卡片生成或推荐卡片生成逻辑。
- 不兼容早期未落库的浏览器本地历史格式。

## Decisions

1. 在 `ChatMessage` 前端类型中新增可选 `createdAt` 字段。

   原因：消息时间属于消息自身事实，放在消息上能让历史展示、排序和保存逻辑共享同一来源。字段设为可选可以兼容运行中尚未携带该字段的新建消息，由保存层统一补齐。

2. 服务端读写保留 `ChatMessage.createdAt`。

   `mapChatSessionToConversation` 返回每条消息的数据库 `createdAt`。`saveChatConversation` 在 `createMany` 时优先使用传入消息的 `createdAt`，缺失时按保存时刻为新消息补时间，并保持同一次保存内的顺序稳定。

3. `ChatConversation.updatedAt` 映射为最后一条有效消息时间。

   历史列表和详情接口仍保留 `updatedAt` 字段名，避免引入额外 API 字段扩散；但该字段语义调整为“历史展示时间”。当没有有效消息时间时，再 fallback 到 `ChatSession.updatedAt`。

4. 前端自动保存增加加载保护。

   加载历史会话时短暂跳过由 state 回填触发的自动保存。后续用户发送新消息、生成卡片或修改上下文时仍走原保存链路。

## Risks / Trade-offs

- [Risk] 旧数据库消息没有前端 `createdAt` 字段但有数据库 `createdAt` → Mitigation：服务端读取时统一从数据库字段补齐。
- [Risk] 客户端伪造极端 `createdAt` 影响排序 → Mitigation：当前保存接口已经信任会话 payload；本次不扩大权限边界，仍受 userId 会话隔离保护。后续如做更强校验，可在 API schema 中限制时间范围。
- [Risk] 自动保存跳过过多导致真实更新丢失 → Mitigation：只跳过加载回填产生的下一次 effect；用户后续交互造成的状态变化继续保存。
