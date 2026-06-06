## Context

当前 `suggestedQuestions` 已收敛为 `final_answer` 和 `ask_user` 共用的可选字符串数组字段，Response Renderer 只会投影模型显式输出的 `suggestedQuestions`。这避免了服务端默认注入固定按钮，但也让模型在成功回答时倾向把下一步写进 `content`，而不是结构化为可点击建议提问。

本次改动属于模型可见 prompt 合同调整，应按 `docs/llm-prompt-guidance.md` 的分层放入 `Action Contract` 和 `Output Contract` 示例：Prompt 定策略，Schema 定形状，Renderer 只投影已校验结果。

## Goals / Non-Goals

**Goals:**

- 让模型知道：成功 `final_answer` 中存在可靠自然下一步时，应把 1-3 条下一步写入 `suggestedQuestions`。
- 保持 `suggestedQuestions` 的可选性，避免所有回复都硬塞建议。
- 让动作候选和结构化训练输出示例覆盖成功回答后的建议提问。
- 保持建议提问只是下一轮普通用户消息，不代表已执行操作。

**Non-Goals:**

- 不恢复旧 `assistantSuggestions`、`assistant_suggestions`、`suggestedReplies` 或旧兼容迁移。
- 不让 Response Renderer、Response Writer 或前端自动注入固定建议按钮。
- 不按用户关键词、短句模板或业务 toolName 做服务端语义分流。
- 不改变 `suggestedQuestions` 的 Zod schema、NDJSON event 或聊天 UI 渲染逻辑。

## Decisions

1. 在 `AgentActionContract` 中新增 `suggestedQuestionsPolicy`。

   理由：`fieldDictionary` 只解释字段含义，`decisionPolicy` 负责 action 选择，成功回答后是否输出建议提问属于 terminal action 的输出策略。单独字段能避免把策略混进字段字典或 system prompt。

   备选方案是在 system prompt 中增加一句规则。该方案优先级过高且容易让所有回复都输出建议，不符合 `suggestedQuestions` 可选合同。

2. 在成功 `final_answer` few-shot 中示范 `suggestedQuestions`。

   理由：模型对示例的遵守通常比抽象规则更稳定。当前示例只在 `ask_user` 中明显使用建议提问，容易让模型把按钮理解为澄清专用。

3. 在 `visibleTrainingProposal.exercise_selection` 示例中补充建议提问。

   理由：动作候选卡片生成后，常见自然下一步是换一批、调整条件或编成训练。这个示例属于 output contract，不需要服务端按具体短句注入按钮。

## Risks / Trade-offs

- [Risk] 模型可能在普通解释中输出过多建议提问。→ Mitigation：策略保留“当前回复自然结束且没有可靠下一步时可以省略”，并禁止把建议提问当作已执行结果。
- [Risk] 建议提问承诺未注册能力。→ Mitigation：沿用现有能力边界，提示建议只代表下一轮普通用户消息，不代表已执行、保存、生成或调用未注册能力。
- [Risk] prompt 变更扩大为服务端行为。→ Mitigation：本 change 不修改 renderer、front-end、chat stream、旧协议迁移或服务端默认按钮注入。
