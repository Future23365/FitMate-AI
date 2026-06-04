## Why

当前 `/dev/ai-traces` 能看到模型返回的 `tool_call` 和最终 `Tool result 摘要`，但缺少 Executor 层逐 tool 的执行证据。开发者无法在同一轮 trace 中确认实际执行入参、toolResultId、输出摘要、失败 code、耗时和 resource 关系，排查业务 tool 时需要反向拼模型响应、runtime 事件和最终摘要。

这个问题在第一个生产业务 tool 接入后变成通用可观测性缺口：如果继续让每个业务 tool 自己补日志，会污染 handler 边界，也会让 trace 展示不一致。

## What Changes

- 在 agent-core trace contract 中新增通用 `tool_execution` 事件，用于记录所有通过 Runtime / Executor 执行的 tool 调用摘要。
- 在 `runAgentRuntime()` 和 confirmation resume 执行路径统一生成 `tool_execution` 事件，覆盖成功、失败、空结果、resource 注册失败和重复失败熔断。
- 将生产文本聊天 trace helper 映射 `tool_execution` 为 `/dev/ai-traces` 可展示的 `tool_call` step，使页面自动展示 Input / Output / Metadata。
- 更新 trace viewer 的 loop 分组和导出 payload，让 tool 执行记录靠近触发它的模型决策。
- 删除未接线的 `searchExerciseResources` 专属 trace summary 函数，避免误导为已被 runtime 使用。
- 不修改 Agent prompt、PlannerPort、Executor handler 调用语义、Policy Guard、Resource Contract Validator、Response Renderer 或任何业务 tool handler。
- 不把完整 handler output、数据库对象、敏感 payload 或未经白名单的内部对象默认写入 trace。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ai-run-trace`: 增加通用 tool execution trace event，规定事件字段、脱敏边界和 runtime 生成时机。
- `ai-trace-debugger`: 页面和导出必须展示逐 tool 执行输入摘要、输出摘要、状态、失败 code、toolResultId、resource id 和耗时。

## Impact

- 预计影响代码：
  - `lib/server/agent-core/contracts.ts`
  - `lib/server/agent-core/runtime.ts`
  - `lib/server/chat/agent-text-chat-service.ts`
  - `components/dev/ai-trace-viewer.tsx`
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
- 预计影响测试：
  - `tests/agent-core/executor-runtime-renderer.test.ts`
  - `tests/chat-service.test.ts`
  - `tests/ai-trace-viewer.test.ts`
  - `tests/agent-tools/search-exercise-resources.test.ts`
- 不涉及 Prisma Schema、数据库迁移、新依赖、生产 NDJSON 协议或前端真实浏览器验证。
