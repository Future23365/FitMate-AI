## 1. OpenSpec 与边界确认

- [x] 1.1 运行 `openspec validate align-langchain-runtime-budget-config --strict`，确认 proposal / design / specs / tasks 合法。
- [x] 1.2 复核本 change 只触碰 LangChain runtime / config / prompt 预算说明 / 测试，不修改 `/api/chat` 主链路、业务 tool handler、provider payload 合同或 response adapter 主流程。

## 2. Runtime 配置同步

- [x] 2.1 删除 `runBudget.maxIterations` 和没有真实消费点的 `structuredOutputValidationTimeoutMs`，同步更新 TypeScript 类型、中文注释和配置测试。
- [x] 2.2 调整 `maxModelCalls`、`maxToolCalls`、`maxActivityReports` 默认值，使 activity report + 多次业务 tool + final response 的常规路径有一致预算。
- [x] 2.3 在 LangChain runtime 中集中推导 `recursionLimit`，不再使用 `maxIterations + 2`。
- [x] 2.4 在 LangChain model call middleware 中执行 `maxModelCalls` 硬门禁，超限时不继续调用 provider，并归一为 `budget_exhausted`。

## 3. 模型可见预算说明

- [x] 3.1 对照 `docs/llm-prompt-guidance.md`，将默认 system prompt 的运行预算说明改为区分业务 tool 调用和 `reportAgentActivity` 活动汇报。
- [x] 3.2 补充或更新 prompt / runtime 测试，确保模型可见说明不再把 activity report 计入业务 tool 预算，也不包含具体业务 phrasing 或固定业务 tool 流程。

## 4. 回归测试与清理

- [x] 4.1 更新 `tests/langchain-agent-runtime/runtime.test.ts`，覆盖 `reportAgentActivity` + 多次业务 tool + final response 不再触发 `budget_exhausted`。
- [x] 4.2 更新 runtime 预算耗尽测试，覆盖 `maxModelCalls` 超限时 provider 不再继续调用且返回 `budget_exhausted`。
- [x] 4.3 使用 `rg` 检查 `maxIterations`、`structuredOutputValidationTimeoutMs` 和旧 `maxIterations` trace 语义没有残留在生产代码、测试中；当前 delta specs 不再把旧字段当作新合同。
- [x] 4.4 运行相关自动化测试：`npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-runtime/config.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts`。
- [x] 4.5 运行 `npm run typecheck`。

## 5. 收尾

- [x] 5.1 检查 `git diff --name-status`，确认没有无关删除、重命名或用户已有改动被混入。
- [x] 5.2 完成本 change 的任务勾选，并准备中文提交信息。
