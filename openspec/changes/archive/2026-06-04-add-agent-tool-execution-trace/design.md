## Context

当前生产文本聊天 trace 已恢复到新 `agent-core` 主链：`LlmPlanner` 写入 `model_request/model_response`，`AgentRunResult.traceEvents` 写入 registry、planner action、validation、budget、policy、resource 和 terminal grounding。页面可以展示每个 step 的 `Input`、`Output`、`Metadata`。

缺口在 Runtime 与 Executor 之间：`executeTool()` 已经统一拿到 tool input 和 handler output，但 `ToolResult` 不保存原始 input；`AgentTraceEvent` 也没有 `tool_execution`。聊天 trace helper 只能在 run 结束后生成一个聚合的 `Tool result 摘要`，无法证明每个 tool 调用实际执行了什么。

任务分类：core trace contract 变更 + trace debugger 展示变更。它不是新增业务 tool，也不是业务 tool bug 修复。

## Goals / Non-Goals

**Goals:**

- 为所有 runtime 执行的 tool 统一记录可调试的安全执行事件。
- 记录 validated input 摘要、projection / fulfillment 摘要、状态、失败 code、toolResultId、toolCallId、resource refs、耗时和 runtime step。
- 让 `/dev/ai-traces` 在同一 loop 中展示 tool 执行记录，并在保存全链路 log 时包含该记录。
- 删除未被 runtime 消费的 `searchExerciseResources` 专属 trace summary 函数。
- 保持 trace 写入和调试展示非致命，不影响用户可见响应。

**Non-Goals:**

- 不把完整 handler output 直接写入 trace。
- 不新增每个 tool 独立日志点。
- 不修改业务 tool handler 的执行语义。
- 不修改 PlannerPort、模型 prompt、model adapter 合同或 response renderer。
- 不新增 trace 持久化表或浏览器验证流程。

## Decisions

### 1. 在 Runtime 层生成通用 `tool_execution`

`runAgentRuntime()` 是最合适的统一点：它拥有已校验的 `ToolCallAction`、tool 定义、policy / resource 结果、`executeTool()` 返回的 `ToolResult`、runtime step 和预算上下文。因此新增 helper 将这些事实投影成 `AgentTraceEvent`。

取舍：在每个 handler 内打点会让业务 tool 负责 runtime 可观测性，且无法统一失败、resource contract 和 confirmation resume。放弃。

### 2. 事件只保存安全摘要

`tool_execution` 允许记录：

- `step`
- `toolName`
- `toolVersion`
- `toolCallId`
- `toolResultId`
- `normalizedInputHash`
- `inputSummary`
- `ok`
- `satisfied`
- `failureCode`
- `fulfillment`
- `projectionSummary`
- `producedResources`
- `consumedResources`
- `startedAt`
- `completedAt`
- `durationMs`

`inputSummary` 来自通过 schema 校验的 `action.input`，再经 `redactJsonValue()` 处理。`projectionSummary` 使用 tool 的 `projection.model/user` 安全投影，不读取完整 `output`。失败只记录 code 和已脱敏 details。

取舍：完整 output 可以更像抓包，但违反现有 `tool output 不会默认进入 model/user/trace` 和敏感 payload 边界，放弃。

### 3. 聊天 trace helper 映射成 `tool_call` step

`recordAgentTextChatRuntimeResultTrace()` 已经逐个映射 runtime event。新增 `tool_execution` 后，`getRuntimeTraceStepType()` 将其映射为 `tool_call`，label 显示为 `Tool 执行`，step 的 `input` 放 `inputSummary`，`output` 放执行结果摘要，metadata 放 eventType、toolName、toolResultId、runtimeStep。

取舍：继续只保留 `Tool result 摘要` 最少改动，但不能满足同轮查看 tool 执行结果的规格。放弃。

### 4. 页面只调整分组，不新增业务 UI

`TraceStepCard` 已经能展示 `Input` 和 `Output`，所以页面改动聚焦在 loop 模块归类：`tool_call` 和 `tool_execution` 进入 Runtime / Validator 模块，跟模型决策在同一 loop 内呈现。保存全链路 log 复用现有 raw trace 和 runtime event 导出。

取舍：做专门的 tool 卡片可以更细，但会放大 UI 范围；本次先让通用 step 可读，避免引入业务特例。

### 5. 删除未接线函数

`summarizeSearchExerciseResourcesTrace()` 当前没有被 runtime 或 trace helper 消费。删除它，避免后续误以为 trace 已经由业务 tool 自己接线。通用 `tool_execution` 会自动覆盖该 tool。

## Risks / Trade-offs

- [Risk] 输入摘要仍可能包含敏感字段。→ Mitigation：统一经过 `redactJsonValue()` 和 dev trace store 的 `sanitizeTraceValue()`，并补测试。
- [Risk] 大 output 无法完整排查。→ Mitigation：trace 明确只保存 projection / fulfillment 摘要；需要完整数据时应在专门安全工具或受控 dev dump 中实现，不默认进入 trace。
- [Risk] `Tool result 摘要` 与逐 tool step 重复。→ Mitigation：保留聚合摘要作为总览，新增逐 tool step 作为因果证据，两者职责不同。
- [Risk] resource contract 失败发生在 handler 成功后。→ Mitigation：`tool_execution` 在 `finalizeToolResultResources()` 之后生成，记录最终 `ok/satisfied/failureCode`。

## Validation

- `openspec validate add-agent-tool-execution-trace --strict`
- `npm test -- tests/agent-core/executor-runtime-renderer.test.ts`
- `npm test -- tests/chat-service.test.ts`
- `npm test -- tests/ai-trace-viewer.test.ts`
- `npm test -- tests/agent-tools/search-exercise-resources.test.ts`
- `npm run typecheck`
