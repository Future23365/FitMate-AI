## 1. 配置和预算

- [x] 1.1 调大模型输出/等待窗口、tool wrapper、terminal failure finalizer、trace / NDJSON 投影和业务 tool 候选数量配置，并保持调用次数预算原值。
- [x] 1.2 将 `toLangChainJsonValue()` 的数组项数和对象字段数裁剪纳入集中配置，并让模型可见摘要、projection、trace 和 finalizer 使用该预算。
- [x] 1.3 同步调大 `searchExerciseResources` repository hard cap 和 `inspectVisibleTrainingProposals` fact store hard cap，避免配置被旧上限静默截断。

## 2. 测试和验证

- [x] 2.1 更新 runtime config、tool、response adapter 和 JSON 投影相关测试，覆盖调大后的预算和结构裁剪边界。
- [x] 2.2 运行 `openspec validate raise-agent-visible-context-limits --strict`。
- [x] 2.3 运行相关自动化测试：`npm test -- tests/langchain-agent-runtime/config.test.ts tests/langchain-agent-runtime/json-projection.test.ts tests/langchain-agent-runtime/response-adapter.test.ts tests/langchain-agent-runtime/terminal-failure-finalizer.test.ts tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/inspect-visible-training-proposals.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts tests/chat-service.test.ts tests/conversation-summary-service.test.ts`。
- [x] 2.4 运行 `npm run typecheck`。
