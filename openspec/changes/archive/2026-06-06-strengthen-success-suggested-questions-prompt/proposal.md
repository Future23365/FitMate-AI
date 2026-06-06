## Why

最新聊天 trace 显示，模型在成功回答中已经用正文表达了自然下一步，但没有输出 `suggestedQuestions`，导致前端没有可点击的建议提问。现有合同只把 `suggestedQuestions` 描述为全局可选字段，且 few-shot 主要覆盖 `ask_user`，不足以稳定引导成功 `final_answer` 输出建议提问。

## What Changes

- 在默认 Agent action contract 中增加专门的 `suggestedQuestions` 输出策略，说明成功回答存在可靠下一步时应输出 1-3 条用户口吻建议提问。
- 为成功 `final_answer` 增加 few-shot 示例，覆盖“正文存在下一步，不应只写在 content”的场景。
- 为 `visibleTrainingProposal` 的 `exercise_selection` 示例补充 `suggestedQuestions`，让动作候选类结构化结果自然带出可点击下一步。
- 不恢复旧 `assistantSuggestions`、`assistant_suggestions`、`suggestedReplies` 协议，不新增服务端默认按钮注入，不改变 renderer 或前端事件协议。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 默认 prompt 的 `suggestedQuestions` 合同增加成功回答自然下一步的正向输出策略和示例要求。

## Impact

- 影响 `lib/server/config/agent-llm-prompt-config.ts` 的模型可见 action contract。
- 影响 `lib/server/config/agent-visible-output-contracts.ts` 的可见训练输出示例。
- 影响 prompt config / visible output contract 相关测试。
- 不影响 `/api/chat` 主链路、Response Renderer、前端 chat client、聊天消息 schema、旧建议字段迁移或服务端语义分流。
