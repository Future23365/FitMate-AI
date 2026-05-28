## Why

当前聊天链路会把结构化 `conversationContext` 和筛选后的历史消息窗口一起传给 LLM。随着对话变长，这会增加 token 成本、让 prompt 混入过多历史细节，并且仍要求多个模型调用理解同一套结构化上下文格式。

本次变更将 AI 可见上下文收敛为“LM 生成的自然语言对话总结 + 当前最新用户消息”，让历史压缩成为明确的服务端能力，避免把完整历史或结构化上下文字段直接暴露给模型。

## What Changes

- 新增聊天上下文总结能力：服务端维护一段自然语言 `contextSummary`，用于承载用户目标、限制、偏好、最近意图、未完成问题和已生成结果的关键信息。
- 调整 `/api/chat` 主链路：意图解析、用户可见回复生成、动作推荐和训练计划生成只接收上下文总结与当前最新消息，不再把历史对话窗口整体传给 LLM。
- 调整 prompt：明确模型只能基于 `conversationSummary` 和 `latestUserMessage` 推断上下文，禁止依赖结构化 `fitnessConversationContext.currentIntent/knownFacts` 这类模型可见字段。
- 调整上下文更新流程：每次用户消息和助手回复完成后，服务端或共享上下文模块生成新的自然语言总结，并写回会话元数据，供下一轮请求使用。
- 保留服务端内部结构化校验：`assistant_action`、`workoutIntent`、候选动作校验、用户可见 stream event 和下游草稿验证仍由服务端结构化逻辑负责。
- **BREAKING**：前端和 API 请求体中的 AI 上下文字段语义从“结构化上下文 + 历史消息窗口”变为“自然语言总结 + 当前最新消息”。旧的 `conversationContext` 传输协议需要替换或迁移。

## Capabilities

### New Capabilities
- `chat-context-summarization`: 定义聊天上下文总结的生成、更新、传递和 LLM 输入边界。

### Modified Capabilities
- `api-layer-boundaries`: 调整聊天编排的模型请求构造契约，要求服务端使用上下文总结和当前最新消息，而不是向 LLM 传递历史消息窗口或模型可见结构化上下文。

## Impact

- 影响 `features/chat/hooks/use-chat-controller.ts`、`features/chat/api/chat-client.ts`、`features/chat/types.ts` 中的请求上下文构造和下游自动生成调用。
- 影响 `lib/shared/chat/fitness-conversation-context.ts` 或其替代模块中的上下文模型、summary 更新逻辑和消息选择工具。
- 影响 `lib/server/chat/chat-service.ts`、`lib/server/ai/prompt-config.ts` 中的意图解析、回复生成、trace 输入和兜底意图构造。
- 影响 `lib/server/workout-plans/ai-workout-plan-service.ts`、`lib/server/exercise-recommendations/ai-exercise-recommendation-service.ts` 及对应 API route 的上下文入参。
- 影响 `lib/server/chat/chat-history-service.ts` 和本地聊天历史元数据，需兼容已有会话缺少新 summary 字段时的初始化。
- 需要更新相关测试、AI trace 断言和文档，确保不会把完整历史对话重新传给 LLM。
