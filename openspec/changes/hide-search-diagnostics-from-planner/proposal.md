## Why

当前 `searchExerciseResources` 在成功返回可用动作候选时，会把内部 `diagnostics` 一并回填给 Planner。名称歧义、命中数量、截断状态等诊断事实会被模型误解为当前候选不可消费，从而继续重复查询，最终触发连续 tool 调用失败。

同时，连续调用上限触发后 runtime 只从后续请求的 tool catalog 中移除该工具；如果 provider 仍返回已移除工具的 `tool_call`，服务端缺少执行前强校验，可能继续进入业务 wrapper 边界。

## What Changes

- 调整 `searchExerciseResources` 的 Planner-visible summary：只暴露可消费动作候选事实，不再暴露原始 `diagnostics` 或会影响模型继续查询判断的内部统计/过滤诊断字段。
- 保留 `diagnostics` 在 `userProjection`、`traceSummary`、日志和测试中的可审计能力，用于排查和 UI/trace 复盘。
- 同步收紧 `searchExerciseResources` tool description，明确内部 diagnostics 不是 Planner 成功候选事实。
- 强化 model-visible contract gate，禁止 `searchExerciseResources` 的 Planner-visible summary 暴露 `diagnostics` 及其嵌套泄漏。
- 增加 LangChain runtime 通用执行边界：provider 返回未在当前 model request 中暴露的 tool name 时，runtime MUST NOT 执行业务 handler，并以受控失败进入收口。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `agent-exercise-resource-query-tool`: 收紧 `searchExerciseResources` 的 Planner-visible observation 边界，将内部 diagnostics 从模型可见成功候选事实中移除。
- `langchain-agent-runtime`: 强化当前 request 可用工具边界，未暴露工具的 provider tool call 不得执行业务 handler。

## Impact

- 影响 `lib/server/langchain-agent/tools/exercise-resource-tools.ts` 中 `searchExerciseResources` 的 `toModelVisibleSummary` 和 description。
- 影响 `lib/server/langchain-agent/model-visible-contract-gate.ts` 的模型可见门禁。
- 影响 `lib/server/langchain-agent/runtime.ts` 的 provider tool call 可用性拦截。
- 需要更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`、`tests/langchain-agent-tools/model-visible-contract-gate.test.ts` 和 `tests/langchain-agent-runtime/runtime.test.ts`。
- 不新增服务端自然语言关键词分流，不新增具体动作名、用户短句或业务 `toolName` 语义特判。
