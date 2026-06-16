## 1. Implementation

- [x] 1.1 在 `buildLangChainAgentSystemPrompt()` 中前置训练请求范围判定，明确未指定肌群不等于全肌群待补齐列表。
- [x] 1.2 调整 `searchExerciseResources` tool description 和 `muscles` schema description，限制 `muscles` 来源并禁止泛化请求拆成全身 inventory。
- [x] 1.3 调整 `submitVisibleTrainingProposal` tool description，表达未指定肌群的可执行 `routine` 不要求全主要肌群覆盖。
- [x] 1.4 更新决策示例，覆盖泛化单次训练请求的首次查询和收口边界。

## 2. Tests

- [x] 2.1 更新 prompt / runtime contract tests，断言训练请求范围判定进入模型可见 prompt。
- [x] 2.2 更新 `searchExerciseResources` 和 production tool catalog tests，断言 `muscles` 来源和 broad query 禁止拆全身 inventory 的模型可见说明。
- [x] 2.3 更新 `submitVisibleTrainingProposal` tests，断言未指定肌群 `routine` 的提交边界进入模型可见说明。
- [x] 2.4 更新模型可见合同门禁或等价测试，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体 `toolName` 语义分支。

## 3. Validation

- [x] 3.1 运行 `openspec validate bound-generic-routine-muscle-scope --strict`。
- [x] 3.2 运行相关自动化测试：`npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/submit-visible-training-proposal.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts tests/langchain-agent-tools/model-visible-contract-gate.test.ts`。
- [x] 3.3 按需运行 `npm run typecheck`，或说明未运行原因。
