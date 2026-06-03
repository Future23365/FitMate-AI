# 聊天请求与页面保留边界

## 1. 文档范围

本文记录旧 AI/Agent 运行时删除后，首页聊天页面和 `/api/chat` 的当前真实链路。

当前聊天页面只保留用户输入、历史会话、本地消息状态和已保存卡片展示壳层。`/api/chat` 仍作为 HTTP 边界存在，但不再执行模型调用、tool calling、artifact 生成、summary 更新或旧 Agent stream。

## 2. 当前请求链路

```txt
用户输入
  ↓
features/chat/hooks/use-chat-controller.ts
  ↓
features/chat/api/chat-client.ts
  ↓
POST /api/chat
  ↓
app/api/chat/route.ts
  ↓
requireCurrentUser()
  ↓
chatRequestSchema
  ↓
getChatConversationById()
  ↓
prepareChatRequest()
  ↓
createChatUnavailableResponse()
  ↓
HTTP 503 JSON: chat_ai_disabled
```

`prepareChatRequest()` 只做非 AI 的请求归一化和历史 hydration。它不会构造运行时上下文包、不会注册工具、不会生成训练卡片，也不会写入 trace。

## 3. 前端发送聊天消息

前端当前仍通过 `requestChatStream()` 调用 `/api/chat`，这是历史命名保留。请求体包含：

- `conversationId`
- `responseMessageId`
- `latestUserMessage`
- `conversationSummary`
- `conversationContext`
- `thinkingEnabled`

由于接口当前返回普通 JSON 错误而不是 NDJSON stream，前端会走非 2xx 失败处理路径。页面不得伪造旧 stream 事件、旧 tool result、训练卡片或模型回复。

## 4. `/api/chat` 服务端职责

`app/api/chat/route.ts` 只负责：

- 本地匿名用户鉴权
- 请求体验证
- 读取已保存会话
- 调用 `prepareChatRequest()` 做历史 hydration
- 返回 `chat_ai_disabled` 禁用响应

禁用响应包含 `conversationId`、`responseMessageId`、`userId` 和 hydration 元数据，便于前端和测试确认请求边界仍可用。

## 5. 页面保留范围

聊天页面可以继续保留：

- 输入框和本地 pending / error 状态
- 历史消息展示
- 已保存的 plan、routine、动作推荐卡片展示
- 会话保存与恢复
- 本地建议按钮渲染

聊天页面不得恢复：

- 旧 Agent 活动状态条
- 旧 Agent 执行结果事件
- 旧 dependency graph 或 legacy skip 诊断
- 旧模型结果投影
- 从 assistant 文本解析可执行 trigger 的逻辑

## 6. 聊天历史保存

前端保存对话时只保存用户可见消息和已存在的结构化卡片状态：

- `messages`
- `plans`
- `routines`
- `exerciseRecommendations`
- `recommendationIntents`
- `conversationSummary`
- `conversationContext`

`createChatConversationSavePayload()` 使用字段白名单，避免请求态 loading、错误状态或旧运行时内部字段进入历史。

## 7. Trace 页面

`/dev/ai-traces` 页面保留为历史 trace 查看器，只展示已经保存的调试数据和 Raw JSON。当前聊天请求不会生产新的 AI trace，也不会恢复旧 Agent 事件。

## 8. 后续重建边界

后续重新接入 AI 聊天能力时，应通过新的 OpenSpec change 重新定义：

- 模型输入合同
- tool calling 合同
- 模型输出结构
- trace 生产协议
- 前端事件协议
- artifact 保存和展示协议

新方案不得依赖或兼容旧运行时已删除的合同；如需重新使用同名概念，也必须以新规格重新定义。

## 9. 关键代码索引

聊天入口：

- `features/chat/hooks/use-chat-controller.ts`
- `features/chat/api/chat-client.ts`
- `app/api/chat/route.ts`
- `lib/server/chat/chat-service.ts`

历史 trace 查看：

- `components/dev/ai-trace-viewer.tsx`
- `lib/server/dev/ai-trace-store.ts`

非 AI 公共服务：

- `lib/server/exercises/exercise-service.ts`
- `lib/server/workout-plans/workout-plan-validation-service.ts`
- `lib/server/conversation-artifacts/artifact-service.ts`
- `lib/server/policy-confirmation/policy-engine.ts`
- `lib/server/user-feedback-memory/user-feedback-memory-service.ts`
