# Agent Planner ToolResult 输入瘦身

时间：2026-06-07 15:00:11 CST

## 当前问题

最近的 Agent trace 显示，Planner 每轮模型输入都会携带上一轮 tool result。旧实现只把成功结果的 `output` 替换为 `"[redacted]"`，但仍把完整 `ToolResult` 形状传给 Planner，包括 `projection.user`、`toolCallId`、`toolVersion`、`idempotencyKey`、`normalizedInputHash`、`startedAt` 和 `completedAt`。

这些字段主要服务于用户展示、trace、replay 和执行审计，不是模型判断下一步 action 所需事实。它们在多轮 tool calling 中重复出现，会持续放大 prompt 体积。

## 调整思路

本次不压缩 tool manifest、system prompt、output contract 或业务 tool schema，也不裁剪 `projection.model`。调整集中在 Agent runtime 到 PlannerPort 的当前 run facts 投影：

- 新增 `PlannerVisibleToolResult`，把 Planner 可见结果和 runtime 内部完整 `ToolResult` 分开。
- 用白名单函数构造 Planner 可见结果，成功结果只保留 `toolName`、`toolResultId`、`ok`、`projection.model` 和完整 `fulfillment`。
- 失败结果保留完整 `error` 与 `fulfillment`，只移除执行元数据。
- `AgentRunResult`、trace、replay 和 renderer 继续使用完整 `ToolResult`，不把瘦身结果反向写回 runtime。

## 关键改动

- `PlannerPort` 和模型 adapter 输入中的 `toolResults` 改为 Planner 专用瘦身视图。
- `runAgentRuntime` 每轮构造 Planner 输入时调用 `toPlannerVisibleToolResult`。
- 测试覆盖 Planner 输入不再包含 `projection.user`、占位 `output` 和执行元数据，同时保留 `projection.model`、resource 引用、失败恢复信息和 runtime 完整结果。

## 验证结果

- `openspec validate slim-planner-visible-tool-results --strict` 通过。
- `npm run typecheck` 通过。
- `npm test -- tests/agent-core/runtime-hardening.test.ts tests/agent-core/redaction-observation-trace.test.ts tests/agent-core/adapter-llm-planner.test.ts` 通过，`29` 个测试全绿。
- `npm test -- tests/agent-core/contract-helper.test.ts tests/agent-core/tool-registry-manifest.test.ts` 通过，`12` 个测试全绿。
- `npm test -- tests/chat-service.test.ts` 通过，`48` 个测试全绿。

## 后续边界

本次只做低风险 runtime context 瘦身。manifest、system prompt、output contract、完整 tool input、`projection.model`、resource 引用或失败恢复信息如果还要继续压缩，应另开 OpenSpec change 评估模型理解风险。
