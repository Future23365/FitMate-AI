## 1. Prompt Contract

- [x] 1.1 在 `AgentActionContract` 中增加 `suggestedQuestionsPolicy`，表达成功回答存在可靠自然下一步时应输出建议提问。
- [x] 1.2 为成功 `final_answer` 增加包含 `suggestedQuestions` 的 few-shot 示例，避免下一步只写入 `content`。
- [x] 1.3 为 `visibleTrainingProposal` 的 `exercise_selection` 示例补充 `suggestedQuestions`。

## 2. Validation

- [x] 2.1 更新 prompt config 测试，覆盖 `suggestedQuestionsPolicy` 和成功回答示例。
- [x] 2.2 更新 visible output contract 测试，覆盖 `exercise_selection` 示例中的 `suggestedQuestions`。
- [x] 2.3 运行 `openspec validate strengthen-success-suggested-questions-prompt --strict`。
- [x] 2.4 运行相关自动化测试。
