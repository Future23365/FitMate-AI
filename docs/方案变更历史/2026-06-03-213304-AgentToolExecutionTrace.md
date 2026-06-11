---
time: 2026-06-03 21:33:04 CST
change: add-agent-tool-execution-trace
---

# Agent Tool 执行 Trace 统一记录

## 当前真实问题

`/dev/ai-traces` 已经能展示模型返回的 `tool_call` 和最终 `Tool result 摘要`，但缺少 Executor 层的逐 tool 执行证据。开发者能看到模型“想调用什么”，也能看到最终聚合摘要，却不能在同一轮里确认实际执行入参、toolCallId、toolResultId、失败 code、耗时、projection 摘要和 resource 引用。

如果让每个业务 tool 自己打日志，会把 runtime 可观测性散落到 handler 里，也容易造成不同 tool 展示格式不一致。

## 调整思路

把 tool 执行日志收口到 `runAgentRuntime()` 的通用执行层。Runtime 在 `executeTool()` 和 resource contract 处理之后生成 `tool_execution` trace event，业务 tool 继续只负责 `toModelObservation` / `toUserProjection` 这类安全投影。

这个设计让所有通过 Runtime / Executor 执行的 tool 自动拥有同一种 trace 记录，不需要为每个 tool 单独加日志点。

## 关键改动

- `AgentTraceEvent` 增加通用 `tool_execution` 事件。
- 普通 tool 执行、duplicate failure fuse 和 confirmation resume 都会记录 `tool_execution`。
- 文本聊天 trace helper 将该事件投影为 `/dev/ai-traces` 的 `tool_call` step。
- trace viewer 将 `tool_call` step 纳入 Agent loop 的 Runtime / Validator 模块，并在保存全链路 log 时保留 input summary。
- 删除 `searchExerciseResources` 中未被通用 runtime 消费的专属 trace summary 函数。

## 边界

- 不记录完整 handler output。
- 不修改 prompt、PlannerPort、Policy Guard、Resource Contract Validator 或 Response Renderer。
- 不在业务 tool handler 中新增日志副作用。
- trace 输入和输出仍经过 redaction / sanitize 边界。

## 验证

- `openspec validate add-agent-tool-execution-trace --strict`
- `npm test -- tests/agent-core/executor-runtime-renderer.test.ts`
- `npm test -- tests/chat-service.test.ts`
- `npm test -- tests/ai-trace-viewer.test.ts`
- `npm test -- tests/agent-tools/search-exercise-resources.test.ts`
- `npm test -- tests/agent-core/redaction-observation-trace.test.ts`
- `npm run typecheck`
