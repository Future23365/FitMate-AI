## 1. 配置和预算

- [x] 1.1 只调大 `toolWrapper.modelVisibleSummaryMaxLength`，并保持模型输出 token、timeout、调用次数预算、业务 tool 候选数量、trace/user projection、finalizer 和聊天 raw message 上限原值。
- [x] 1.2 将 `ToolMessage content` 模型可见摘要链路中的 `toLangChainJsonValue()` 数组项数和对象字段数裁剪纳入集中配置，并确保该结构预算不用于 userProjection、traceSummary、NDJSON projection 或 finalizer 输入。
- [x] 1.3 还原 `searchExerciseResources` repository hard cap 和 `inspectVisibleTrainingProposals` fact store hard cap，确认它们属于业务返回数量边界而不是 `status: "truncated"` 摘要截断配置。

## 2. 测试和验证

- [x] 2.1 更新 runtime config、tool wrapper、业务 tool 模型可见摘要和 JSON 投影相关测试，覆盖只放大模型可见摘要预算、不放大业务投影或候选数量的边界。
- [x] 2.2 运行 `openspec validate raise-agent-visible-context-limits --strict`。
- [x] 2.3 运行相关自动化测试：`npm test -- tests/langchain-agent-runtime/config.test.ts tests/langchain-agent-runtime/json-projection.test.ts tests/langchain-agent-runtime/response-adapter.test.ts tests/langchain-agent-runtime/terminal-failure-finalizer.test.ts tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/inspect-visible-training-proposals.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts tests/chat-service.test.ts tests/conversation-summary-service.test.ts`。
- [x] 2.4 运行 `npm run typecheck`。
