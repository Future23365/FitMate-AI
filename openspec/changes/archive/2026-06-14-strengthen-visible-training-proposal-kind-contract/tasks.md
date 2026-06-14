## 1. OpenSpec 与边界确认

- [x] 1.1 运行 `openspec validate strengthen-visible-training-proposal-kind-contract --strict`，确认 proposal、design、spec delta 和 tasks 结构有效。
- [x] 1.2 对照 `docs/llm-prompt-guidance.md` 和 Agent prompt 合同治理要求，确认本次规则分别落在 system prompt、tool description 和 schema description 的正确层级。
- [x] 1.3 确认实现不修改 LangChain runtime 主循环、`/api/chat` route、validator 行为、response adapter、通用 `tool_schema_invalid` 失败反馈或服务端语义分流。

## 2. 模型可见合同实现

- [x] 2.1 调整 `buildLangChainAgentSystemPrompt()` 中结构化训练结果的高层描述，移除“具体动作集合默认提交为 `exercise_selection`”的偏置。
- [x] 2.2 在 `submitVisibleTrainingProposal` tool description 中新增互斥 `Kind Selection` 合同，并澄清服务端不替模型生成 `prescription`。
- [x] 2.3 补强 `visibleTrainingProposal` 相关 schema description，使 `kind`、`prescription`、`schedule` 的条件必填和禁止关系在模型可见 schema 中明确。

## 3. 测试与验证

- [x] 3.1 更新 `submitVisibleTrainingProposal` tool description 测试，覆盖 `Kind Selection`、`exercise_selection` / `routine` / `plan` 的关键边界。
- [x] 3.2 更新 production tool catalog / model-visible contract 相关测试，验证生产模型可见 schema description 暴露新的判别合同。
- [x] 3.3 更新 LangChain runtime prompt 测试，验证默认 prompt 不再把所有具体动作条目默认绑定到 `exercise_selection`。
- [x] 3.4 运行相关自动化测试：`npm test -- tests/langchain-agent-tools/submit-visible-training-proposal.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts tests/langchain-agent-runtime/runtime.test.ts`。
- [x] 3.5 运行 `npm run typecheck`，确认 TypeScript 合同仍然通过。
