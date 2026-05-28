## Context

当前聊天链路已经把 `/api/chat` 编排下沉到 `lib/server/chat/chat-service.ts`，并通过 `lib/server/ai/prompt-config.ts` 管理 prompt。前端会从完整消息列表构造 `conversationContext`，再用 `selectMessagesForAiContext()` 选出一个历史窗口，连同当前请求一起传给 `/api/chat`、`/api/ai/workout-plan` 和 `/api/ai/exercise-recommendations`。

这个方案解决了早期长对话直接传全量消息的问题，但仍有三个缺点：

- LLM 仍会看到多条历史消息，token 成本和噪音随对话增长而上升。
- 模型需要理解 `fitnessConversationContext.currentIntent/knownFacts/unresolvedQuestions` 这类结构化字段，prompt 和 fallback 逻辑耦合较重。
- 客户端负责构造上下文，导致“模型可见上下文”和“服务端内部事实/权限/校验上下文”边界不够清晰。

本次设计将模型输入边界改为“自然语言总结 + 当前最新用户消息”。结构化上下文仍可作为服务端内部状态或兼容迁移数据存在，但不能作为 LLM 可见协议继续扩散。

## Goals / Non-Goals

**Goals:**

- 让所有聊天相关 LLM 调用只接收自然语言 `conversationSummary` 和当前最新用户消息，避免传递完整历史或历史消息窗口。
- 用一个服务端可测试的 summary 更新流程替代客户端散落的结构化上下文构造。
- 调整 prompt，让模型明确基于总结理解前文，并把当前最新用户消息作为本轮最高优先级输入。
- 保留 `assistant_action`、`workoutIntent`、动作候选校验、Zod 校验和 stream event 等服务端结构化安全边界。
- 兼容已有会话缺少新 summary 字段的情况，首次请求可从已有消息生成初始总结。
- 让 AI Trace 明确展示 summary 更新、模型实际输入和是否有历史消息泄漏。

**Non-Goals:**

- 不改变用户可见聊天 UI、stream event 格式或动作卡片展示形态。
- 不让 LLM 直接读写数据库，也不把 summary 当作未经校验的事实来源持久化训练计划。
- 不在本次引入向量记忆、长期用户画像或跨会话记忆。
- 不为旧 `conversationContext` 模型可见格式增加长期兼容层；只做必要迁移和缺省初始化。

## Decisions

### 1. 引入 `ConversationSummaryContext` 作为模型可见上下文

新增或替换共享上下文类型，建议字段保持窄而明确：

```ts
type ConversationSummaryContext = {
  summary: string;
  latestUserMessage: string;
};
```

`summary` 是自然语言，长度受控，例如 1200-2000 字以内；`latestUserMessage` 是本轮用户最新消息。所有 LLM 调用都基于这两个字段构造 messages：system prompt 携带 summary，user message 只放 latest user message。

取舍：继续保留 `knownFacts/currentIntent` 给模型更“结构化”，但这正是用户要移除的负担。结构化字段可以留在服务端内部函数里做候选筛选和兜底，不再作为模型输入协议。

### 2. Summary 更新归服务端所有，客户端只传当前消息和已有 summary 标识

前端发送 `/api/chat` 时只需要传：

- 当前最新用户消息。
- 当前会话已有 `conversationSummary`，或会话 id 让服务端从历史读取。
- `thinkingEnabled` 等与模型调用相关的显式开关。

服务端在接收请求后生成本轮模型输入，并在助手回复结束后把“旧 summary + 当前用户消息 + 助手回复 + 内部动作摘要”压缩成新的 summary，写回消息 metadata 或 conversation metadata。

取舍：客户端继续生成 summary 可以减少一次服务端状态读取，但会让 summary 策略分散在浏览器端，也不利于权限隔离和 trace。服务端所有更符合当前架构规则。

### 3. Summary 生成使用独立 prompt，可先支持启发式兜底

理想路径是新增 `chatContextSummarization` prompt，用 LLM 将旧 summary、本轮用户消息、助手回复、触发的内部动作和结果摘要压缩为新的自然语言总结。为了保证可用性，应同时提供确定性兜底：

- 当 summary 模型失败或 API key 缺失时，用旧 summary 加本轮关键文本截断生成兜底 summary。
- 兜底 summary 必须标明不确定信息，不能把默认值写成用户明确表达。
- 高风险健康限制、伤痛、器械、时间、经验、目标、避免项和最近未完成问题优先保留。

取舍：完全依赖 LLM summary 更自然，但失败时会中断聊天上下文延续；启发式兜底能保持系统可用，但不能替代后续结构化校验。

### 4. 当前最新消息是唯一 user message，历史只能进入 summary

`resolveChatIntent()`、`buildSystemPrompt()`、`extractWorkoutPlanIntent()`、动作推荐生成和训练草稿生成都不得再拼接 `selectMessagesForAiContext()` 的历史窗口。模型请求结构应类似：

```ts
[
  { role: "system", content: systemPromptWithConversationSummary },
  { role: "user", content: latestUserMessage },
]
```

对于下游自动生成调用，`assistant_action.intent` 仍是服务端结构化结果；如果还需要语言上下文，只传 summary 和当前请求，不传前序消息数组。

取舍：只传 summary 可能丢失一些原始措辞，但它换来稳定 token 成本、清晰边界和更可控 prompt。关键事实由 summary prompt 和服务端结构化校验共同保障。

### 5. Trace 必须证明没有历史消息窗口泄漏

AI Trace 需要记录：

- 本轮 `latestUserMessage`。
- 使用的 `conversationSummary`。
- summary 更新输入和输出。
- 每次模型调用的 messages 数量和摘要。

Trace 中可以保留开发调试信息，但模型请求 step 的 `messages` 不应包含多条历史 user/assistant 对话。这样后续排查时能直接确认“没有把完整历史传给 LLM”。

## Risks / Trade-offs

- [Risk] Summary 丢失用户早期限制，导致动作选择不安全 → Mitigation：summary prompt 明确保留目标、伤痛、器械、时间、经验、偏好、避免项和未完成问题；服务端候选筛选和高风险提示仍做结构化校验。
- [Risk] 当前旧会话只有 `conversationContext`，没有自然语言 summary → Mitigation：迁移期从旧 `conversationContext.summary` 或历史消息初始化 summary；初始化只作为兼容入口，不继续向模型传结构化字段。
- [Risk] 增加 summary 模型调用会带来成本和延迟 → Mitigation：仅在有新用户消息或助手回复完成后更新；短对话可使用确定性 summary；trace 记录 token usage 便于后续优化。
- [Risk] 下游计划/推荐生成仍依赖历史消息数组类型 → Mitigation：先引入统一的 `AiConversationInput`，再逐个替换调用点，删除或收窄 `selectMessagesForAiContext()`。
- [Risk] Summary 是自然语言，不能作为最终事实直接持久化训练计划 → Mitigation：训练计划、routine、动作推荐仍必须经过 `workoutIntent`、候选动作和 Zod Schema 校验。

## Migration Plan

1. 新增 `ConversationSummaryContext` 类型、summary prompt 配置和 summary 更新服务。
2. 调整 `/api/chat` request schema 和前端 `requestChatStream()`，只发送当前最新消息与 summary 上下文。
3. 改造 `chat-service`，让意图解析、回复生成、动作候选和 trace 都基于 `conversationSummary + latestUserMessage`。
4. 改造 `/api/ai/workout-plan` 和 `/api/ai/exercise-recommendations` 的请求与服务输入，移除历史消息窗口。
5. 更新聊天历史 metadata 的保存/恢复逻辑，旧会话缺 summary 时从旧字段或历史消息初始化。
6. 删除或限制 `selectMessagesForAiContext()` 的模型调用用途，保留测试或迁移辅助时需明确命名。
7. 补测试、更新文档并运行 `openspec validate summarize-ai-chat-context --strict`、相关自动化测试和类型检查。

## Open Questions

- Summary 更新是否每轮都调用 LLM，还是先使用确定性摘要并只在上下文超过阈值时调用 LLM？实现阶段默认优先做可测试的确定性兜底，同时保留 LLM summary prompt 接口。
