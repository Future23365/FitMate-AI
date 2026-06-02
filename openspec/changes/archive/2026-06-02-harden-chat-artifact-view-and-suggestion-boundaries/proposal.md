## Why

最新聊天 trace 暴露出几个同源问题：短回复和查看请求会被 Agent 带入不合适的执行出口，用户可见建议里出现当前产品未开放的保存动作，查看最近训练时只返回文字而不重投影训练卡片，并且服务端 recent artifact 索引与前端气泡卡片数量不一致。继续只补 prompt 或只改前端展示，会让模型语义、artifact 事实源和用户可见操作边界继续脱节。

本 change 的目标是收紧 Tool-first Agent 在“非写入对话、artifact 查看、建议按钮、artifact 写入绑定”四个边界上的合同。服务端仍不得用关键词、正则、短句模板或同义词表判断用户自然语言语义；`好的`、`没有` 等短回复是否表示确认、否定、闲聊或取消，必须由 LLM 结合上下文通过结构化输出表达，服务端只校验工具调用和结果投影的确定性合同。

## What Changes

- 调整 Agent prompt / structured output 合同，使模型在没有明确生成、修改、保存或查看目标时返回普通回答、澄清或结构化阻断，而不是进入训练生成、保存或通用失败出口。
- 明确 artifact 查看路径：当模型通过受控工具读取到 routine / plan payload，并以 `answered` 完成查看类请求时，聊天流必须能重新投影对应训练卡片。
- 收紧用户可见 `assistantSuggestions`：不得展示当前产品未开放、无法由点击后用户消息安全完成的写操作建议，例如“先验证再保存”“保存训练”。
- 将 `responseMessageId` 从模型输入职责中移出，由服务端 runtime / tool context 注入 artifact 写工具，确保 Agent 写入的 artifact 与当前 assistant 气泡稳定绑定。
- 收敛 `ConversationArtifact` / `ArtifactIndex` 重复 active 记录：同一会话、同一 assistant message、同 kind 和同 payload 的卡片不得因为 Agent 写入与聊天自动保存两条入口叠加而产生多条 active recent artifact。
- 修正聊天上下文事实提取边界：操作性请求、查看请求、保存请求、短确认或短否定不得被确定性摘要误记为用户训练目标；这只约束服务端事实摘要，不允许服务端改写模型 intent。
- 补充黑盒和单元回归，覆盖短回复不触发写链、查看 recent routine 生成卡片、未开放保存建议被过滤、同一生成结果不产生重复 active artifact。

## Capabilities

### New Capabilities

无。本 change 修订现有聊天主链、artifact 和建议能力，不新增独立产品能力。

### Modified Capabilities

- `tool-first-agent-orchestrator`: 收紧 Agent 对非写入对话、artifact 查看、写工具输入来源和最终投影的执行边界。
- `conversation-artifact`: 补充 artifact 查看重投影、messageId 服务端绑定和 active artifact 去重要求。
- `assistant-suggestions`: 补充用户可见建议的产品能力边界，禁止展示当前未开放或点击后不可安全执行的写操作建议。
- `chat-context-summarization`: 补充上下文事实摘要边界，避免操作性用户消息被确定性提取为训练目标事实。

## Impact

- 影响 `lib/server/ai/prompt-config.ts` 或等价 Agent prompt module，强化模型对无明确执行意图、artifact 查看和未开放保存能力的结构化输出边界。
- 影响 `lib/server/agent-orchestrator/runtime.ts`、`tool-registry.ts`、`workout-tools.ts`，将 `responseMessageId` 作为服务端执行上下文事实注入写工具，而不是交给模型提供。
- 影响 `lib/server/agent-orchestrator/response-writer.ts` 和 `lib/server/chat/chat-service.ts`，过滤不可展示建议，并在 `answered + getArtifactPayload` 查看结果中推送 routine / plan card event。
- 影响 `lib/server/conversation-artifacts/artifact-service.ts` 和 `lib/server/chat/chat-history-service.ts`，统一 Agent 写入与聊天自动保存的 artifact 绑定和去重规则。
- 影响 `lib/shared/chat/fitness-conversation-context.ts`，只收紧确定性事实摘要，不新增服务端自然语言语义判断。
- 影响 `tests/chat-service.test.ts`、`tests/agent-orchestrator.test.ts`、`tests/chat-context.test.ts`、`tests/chat-assistant-suggestions.test.ts` 以及相关 LLM 黑盒用例。
- 不新增数据库表，不修改 Prisma Schema，不开放保存训练产品功能，不放宽用户隔离、Validator、Policy 或 artifact payload 校验。
