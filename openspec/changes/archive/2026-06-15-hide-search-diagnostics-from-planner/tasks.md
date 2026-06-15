## 1. OpenSpec 与治理门禁

- [x] 1.1 完成 Agent tool 变更边界检查：本 change 分类为 Agent tool bug 修复 + LangChain runtime 通用可用性边界补强。
- [x] 1.2 完成 Agent prompt/model-visible 合同检查：只调整 `searchExerciseResources` tool description 和 tool result summary，不新增通用 prompt 特例。
- [x] 1.3 完成抽象层级门禁检查：确认未新增关键词规则、自然语言模板路由、phrasing 特判或具体动作名生产规则。
- [x] 1.4 运行 `openspec validate hide-search-diagnostics-from-planner --strict`。

## 2. 实现

- [x] 2.1 更新 `searchExerciseResources` 的 `toModelVisibleSummary`，从 Planner-visible observation 中移除原始 `diagnostics` 和相关内部诊断字段，同时保留 `userProjection` / `traceSummary` 诊断。
- [x] 2.2 更新 `searchExerciseResources` 的 tool description，明确内部 `diagnostics` 不作为 Planner 成功候选事实。
- [x] 2.3 更新 `model-visible-contract-gate`，禁止 `searchExerciseResources` Planner-visible summary 暴露 `diagnostics` 及嵌套诊断泄漏。
- [x] 2.4 更新 LangChain runtime，在 provider 返回当前 model request 未暴露的 tool call 时拒绝执行业务 handler，并记录受控失败。

## 3. 测试与验证

- [x] 3.1 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，覆盖 `modelVisibleSummary` 不含 `diagnostics`，但 `userProjection` / `traceSummary` 仍保留诊断。
- [x] 3.2 更新 `tests/langchain-agent-tools/model-visible-contract-gate.test.ts`，覆盖 `diagnostics` key 和嵌套字符串泄漏会失败。
- [x] 3.3 更新 `tests/langchain-agent-runtime/runtime.test.ts`，覆盖未暴露 provider tool call 不执行 handler。
- [x] 3.4 运行 `npm test -- tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/model-visible-contract-gate.test.ts tests/langchain-agent-runtime/runtime.test.ts`。
- [x] 3.5 运行 `npm run typecheck`。
- [x] 3.6 检查最终 diff，确认没有新增服务端自然语言分流、业务 `toolName` 语义分支或无关重构。
