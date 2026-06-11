## 1. OpenSpec 与门禁

- [x] 1.1 使用 `agent-tool-change-governance` 完成执行合同范围确认，保持 `/api/chat` 主链路和 LangChain runtime 业务语义不变。
- [x] 1.2 使用 `agent-fix-abstraction-gate` 完成抽象层级门禁审查，确认没有新增关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
- [x] 1.3 运行 `openspec validate fix-langchain-tool-schema-repair-and-exercise-visibility --strict`。

## 2. Runtime / Wrapper Repair Payload

- [x] 2.1 更新 `executeLangChainToolWrapper` 的 schema 失败模型可见 `modelMessage`，包含消毒后的字段级 `issues[]`。
- [x] 2.2 确保 `issues[]` 只暴露 `path`、`code`、`message`、`expected`、`actual` 等稳定字段，不暴露 stack trace、完整 schema、内部路径、完整 handler payload、secret 或跨用户数据。
- [x] 2.3 补充或更新 wrapper / runtime 测试，覆盖非法 tool input 返回字段级 repair payload，且仍拒绝执行 handler。

## 3. searchExerciseResources published 合同清理

- [x] 3.1 从 `searchExerciseResourcesInputSchema`、schema description 和 tool description 中移除 `published`。
- [x] 3.2 从 `searchExerciseResources` output schema、handler output、query summary、`appliedFilters`、`filterApplications` 和 broad query 判断中移除模型可见 `published`。
- [x] 3.3 调整 `exercise-resource-filter-policy` 和 repository 查询入口，确保 `published` 不再作为 Planner input 或模型可控 hard filter。
- [x] 3.4 更新 production tool catalog / manifest 测试，确认 `published` 不再出现在 Planner 可见 schema、description 或 examples 中。

## 4. 回归测试与验证

- [x] 4.1 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，覆盖成功查询、旧 `published` 字段拒绝、query summary 不含 `published`、`appliedFilters` 不含 `published`。
- [x] 4.2 更新 `tests/langchain-agent-tools/production-tool-catalog.test.ts`，覆盖生产 catalog 不暴露 `published`。
- [x] 4.3 运行 `npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts`。
- [x] 4.4 运行 `npm run typecheck`。
- [x] 4.5 最终 diff 检查，确认没有服务端自然语言分流、没有 `searchExerciseResources` 专属 runtime 分支、没有旧 `published` 模型可见合同残留。
