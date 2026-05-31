## Why

当前聊天推送的动作推荐、routine 和 plan 卡片只存在于消息展示与局部 payload 中，后续用户说“这个”“上一个”“刚才那套”时，系统缺少稳定的结构化事实源。需要先把 UI 卡片沉淀为可检索、可引用、可修订的 ConversationArtifact，避免继续依赖 `conversationSummary` 承担完整训练内容事实源职责。

## What Changes

- 新增 `ConversationArtifact` 作为聊天卡片、已保存 routine 和未来 schedule 的结构化事实对象。
- 新增 `ArtifactIndex` 作为 artifact 的轻量检索索引，避免每次引用解析都扫描复杂 payload。
- 成功推送动作推荐、routine 或 plan 卡片后，服务端创建 artifact 并记录对应 `messageId`、`sessionId`、`userId` 和结构化 payload。
- artifact 修改时不覆盖旧版本，而是创建新版本并将旧版本标记为 `superseded`。
- `conversationSummary` 继续保存自然语言上下文摘要，但不得作为训练卡片完整事实源。

## Capabilities

### New Capabilities
- `conversation-artifact`: 定义聊天结构化卡片作为 AI 可引用事实源的保存、索引、版本和读取要求。

### Modified Capabilities

## Impact

- 影响聊天推送动作推荐、routine 和 plan 卡片后的服务端保存链路。
- 影响训练草稿、消息 metadata、会话上下文构建和后续 AI 编排输入。
- 可能需要新增 Prisma 表或等价持久化结构：`ConversationArtifact`、`ArtifactIndex`。
- 需要补充 artifact 创建、索引生成、权限隔离和版本状态测试。
