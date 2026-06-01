# 2026-06-01 12:10:02 CST 聊天历史服务端 Hydration

## 真实问题

基础首页聊天黑盒流程已经接近真实用户请求形态：每轮只带 `conversationId`、`latestUserMessage`、`conversationSummary` 和 response id。旧 `/api/chat` 虽然会用 `conversationId` 读取 recent artifact summaries，但不会读取已保存会话的结构化 `messages`、`conversationContext` 和 `recommendationIntents`。结果是服务端 action gate 只能从最新一句话和自然语言 summary 判断意图，长期计划补齐、已有 plan 的周频调整、序号动作讲解诊断都容易失真。

## 调整思路

把 `/api/chat` 的事实恢复边界前移到请求准备阶段：先按 `conversationId + current user` 读取已保存会话和 current-session artifact summaries，再统一交给 `prepareAiChatRequest()`。已保存会话成为 action gate 的可信结构化上下文，客户端提交的 `messages` / `conversationContext` 只在没有保存事实时作为 schema 校验后的 fallback。

## 关键改动

- `PreparedAiChatRequest` 新增 `hydration` 元数据，记录 `source`、是否读到保存会话、恢复消息数、recent artifact 数和 `recommendationIntent` 数。
- `prepareAiChatRequest()` 支持接收保存会话和 recent artifact summaries，优先使用服务端会话恢复 `rawMessages`、`conversationSummaryContext` 和 `internalConversationContext`。
- plan gate trace 记录 `weeklyFrequency`、`sessionMinutes`、recent artifact kind 和 hydration source，方便黑盒失败后定位是事实丢失还是意图归一化问题。
- 确定性 `exercise_explanation` 回复新增 `reference_diagnostic` 流事件，runner 可以记录 `artifactId`、`artifactKind`、payload 读取状态和 reference 状态，不再只依赖 `assistant_action`。
- token 预估逻辑抽到独立 helper，只接受完整真实报告；跳过报告、缺字段报告和 `total_tokens=0` 不再作为成本校准基线。

## 验证结果

- `npm run test -- tests/chat-service.test.ts tests/manual-llm-flow-policy.test.ts`：50 个测试通过。
- 后续仍需按 OpenSpec tasks 运行 `npm run typecheck` 和 `openspec validate hydrate-chat-history-context --strict`。
