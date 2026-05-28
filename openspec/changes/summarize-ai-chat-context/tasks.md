## 1. 上下文模型与摘要服务

- [ ] 1.1 新增 `ConversationSummaryContext` 共享类型和 Zod Schema，表达 `summary` 与 `latestUserMessage` 的模型可见输入边界。
- [ ] 1.2 新增服务端 summary 更新服务，支持基于旧 summary、本轮用户消息、助手回复和内部动作摘要生成新的自然语言 summary。
- [ ] 1.3 为 summary 更新服务补确定性兜底逻辑，确保 LLM summary 失败时仍能保留目标、限制、器械、时长、偏好和未完成问题。
- [ ] 1.4 调整或收窄 `fitness-conversation-context` 相关工具，移除模型调用路径对 `selectMessagesForAiContext()` 历史窗口的依赖。

## 2. Chat 主链路改造

- [ ] 2.1 调整 `/api/chat` request schema 和 `features/chat/api/chat-client.ts`，改为传当前最新用户消息与 `conversationSummary`，不再传历史消息窗口。
- [ ] 2.2 改造 `features/chat/hooks/use-chat-controller.ts`，发送聊天、自动生成计划、自动生成推荐时复用 summary 上下文和当前最新请求。
- [ ] 2.3 改造 `lib/server/chat/chat-service.ts`，让 `prepareAiChatRequest()`、意图解析、回复生成和兜底意图都基于 summary + latest user message。
- [ ] 2.4 调整 `assistant_action` 后的上下文更新时机，在助手回复和内部动作摘要可用后写回新的 `conversationSummary`。
- [ ] 2.5 调整 `lib/server/chat/chat-history-service.ts` 和聊天 metadata 读写，兼容旧会话缺少 `conversationSummary` 的初始化。

## 3. Prompt 与下游 AI 调用

- [ ] 3.1 在 `lib/server/ai/prompt-config.ts` 中新增或调整 `chatContextSummarization`、`chatIntentResolution`、`chatCompletion` prompt，明确模型只使用 `conversationSummary` 和最新用户消息。
- [ ] 3.2 改造 `lib/server/workout-plans/ai-workout-plan-service.ts`，让意图抽取和草稿生成不再接收 selected history messages。
- [ ] 3.3 改造 `lib/server/exercise-recommendations/ai-exercise-recommendation-service.ts`，让动作推荐生成使用 summary 和最新请求，并继续遵守候选动作约束。
- [ ] 3.4 调整对应 API route 的 Zod schema、trace 输入和错误处理，删除模型可见的旧结构化 `conversationContext` 协议。

## 4. Trace、文档与清理

- [ ] 4.1 更新 AI Trace 记录，展示 `latestUserMessage`、`conversationSummary`、summary 更新输入输出，以及每次模型调用没有历史消息窗口。
- [ ] 4.2 清理或重命名不再用于模型调用的历史消息选择工具，避免后续误用。
- [ ] 4.3 更新 `docs/architecture.md` 或相关 README，说明聊天上下文现在由服务端 summary 维护，模型只接收 summary + 当前消息。
- [ ] 4.4 检查并更新开发日志或调试页面中关于 `conversationContext` 的展示字段。

## 5. 测试与验证

- [ ] 5.1 为 summary schema、summary 更新兜底、旧会话初始化和历史消息不泄漏补单元测试。
- [ ] 5.2 为 `/api/chat` 请求准备、意图解析输入和回复生成输入补测试，断言模型 messages 只包含 system + 当前 user message。
- [ ] 5.3 为 workout plan 和 exercise recommendation 下游服务补测试，断言它们不再传 selected history messages 且仍校验 `workoutIntent` 和候选动作。
- [ ] 5.4 运行 `openspec validate summarize-ai-chat-context --strict`。
- [ ] 5.5 运行相关自动化检查，至少包含 `npm test` 和 `npm run typecheck`；如改动影响构建或路由边界，再运行 `npm run build`。
