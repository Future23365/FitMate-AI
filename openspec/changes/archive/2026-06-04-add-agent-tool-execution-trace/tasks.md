## 1. OpenSpec 与边界确认

- [x] 1.1 确认现有 `AgentTraceEvent`、`runAgentRuntime()`、confirmation resume、聊天 trace helper 和 `/dev/ai-traces` 分组逻辑。
- [x] 1.2 确认本 change 不修改 prompt、PlannerPort、Policy Guard、Resource Contract Validator、Response Renderer 或业务 tool handler。
- [x] 1.3 确认 `searchExerciseResources` 未接线 trace summary 函数可删除，且删除后没有引用残留。

## 2. Runtime Trace Contract

- [x] 2.1 在 `AgentTraceEvent` 中新增通用 `tool_execution` 事件类型，字段覆盖 toolName、toolCallId、toolResultId、input summary、output summary、状态、失败 code、resource refs 和耗时。
- [x] 2.2 在 `runAgentRuntime()` 普通 tool 调用路径中，在 `finalizeToolResultResources()` 后追加 `tool_execution` 事件。
- [x] 2.3 在 duplicate failure fuse 路径中追加 `tool_execution` 事件，并标记 fuse reason。
- [x] 2.4 在 `resumeConfirmedAction()` 路径中追加 `tool_execution` 事件，使用服务端 pending action input。
- [x] 2.5 确保事件只使用 schema 校验后的 input、`projection.model/user`、fulfillment 和已脱敏错误摘要，不写入完整 handler output。

## 3. Trace Viewer 与导出

- [x] 3.1 更新 `recordAgentTextChatRuntimeResultTrace()` 的 runtime event 投影，将 `tool_execution` 映射为 `tool_call` step。
- [x] 3.2 更新 runtime event label、step type 和 summary，使页面能展示逐 tool Input / Output / Metadata。
- [x] 3.3 更新 loop 分组逻辑，确保 tool execution step 与触发它的模型决策在同一 runtime step 内展示。
- [x] 3.4 确认 `createTraceLogPayload()` 导出包含 tool execution event。

## 4. 清理未接线函数

- [x] 4.1 删除 `summarizeSearchExerciseResourcesTrace()`。
- [x] 4.2 检查并移除相关未使用类型 import。

## 5. 测试

- [x] 5.1 更新 agent-core runtime 测试，覆盖成功 tool 的 `tool_execution` event。
- [x] 5.2 更新 agent-core runtime 测试，覆盖失败或 duplicate failure fuse 的 `tool_execution` event。
- [x] 5.3 更新 chat service trace 测试，断言 `/dev/ai-traces` step 中包含 tool execution input/output 摘要。
- [x] 5.4 更新 trace viewer 测试，断言 `tool_call` step 进入 loop timeline 并可导出。
- [x] 5.5 更新 `searchExerciseResources` 测试或 TypeScript 检查，证明未接线函数删除后无引用残留。

## 6. 验证与收尾

- [x] 6.1 运行 `openspec validate add-agent-tool-execution-trace --strict`。
- [x] 6.2 运行 `npm test -- tests/agent-core/executor-runtime-renderer.test.ts`。
- [x] 6.3 运行 `npm test -- tests/chat-service.test.ts`。
- [x] 6.4 运行 `npm test -- tests/ai-trace-viewer.test.ts`。
- [x] 6.5 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts`。
- [x] 6.6 运行 `npm run typecheck`。
- [x] 6.7 最终检查 `git diff`，确认没有混入无关改动。
