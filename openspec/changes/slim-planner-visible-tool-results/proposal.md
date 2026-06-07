## Why

最近一次真实 Agent trace 显示，每轮 Planner 输入中 `toolResults` 会把已脱敏但仍接近完整的运行时结果继续发送给模型；其中 `projection.user`、执行元数据和占位 `output: "[redacted]"` 对下一步决策没有必要，却会在多轮 tool calling 中重复消耗 token。

本 change 先做最低风险优化：只压缩 Planner 可见的 tool result 上下文，不改变 tool manifest、tool schema、`outputContracts`、repair 合同或服务端校验。

## What Changes

- 新增或收紧 Planner 可见 tool result 的专用投影类型，只保留模型决策和 grounding 所需字段。
- `redactToolResultForPlanner` 或等价构造入口从“完整 `ToolResult` 替换 output”改为“构造 Planner 专用瘦身对象”。
- Planner 输入中的成功 tool result SHALL 保留 `toolName`、`toolResultId`、`ok`、`fulfillment`、`projection.model` 以及必要的 resource 引用。
- Planner 输入中的成功 tool result SHALL NOT 包含 `projection.user`、完整 `input`、`output: "[redacted]"`、`toolCallId`、`toolVersion`、`normalizedInputHash`、`startedAt`、`completedAt` 等仅供执行、trace 或用户展示使用的字段。
- 完整 `ToolResult` 仍保留在 runtime result、trace、replay 和 renderer 可用路径中，用户展示与审计能力不因本 change 退化。
- 明确不修改 `terminal_reference_invalid` / repair feedback，不压缩 `inputJsonSchema`、`outputJsonSchema`、`whenToUse`、`whenNotToUse` 或 `visibleTrainingProposal` 输出合同。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ai-token-budgeting`: Agent Planner 模型输入中的已登记 tool result 必须使用 Planner 专用瘦身视图，避免把用户展示投影和运行时执行元数据重复发送给模型。

## Impact

- 影响模块：
  - `lib/server/agent-core/runtime.ts`
  - `lib/server/agent-core/contracts.ts`
  - `lib/server/agent-core/planner-port.ts`
  - 相关 Agent runtime / planner input 测试
- 不影响模块：
  - `ToolRegistry.serializeForPlanner`
  - `toolToManifest`
  - 业务 tool `inputSchema` / `outputSchema`
  - `searchExerciseResources.toModelObservation`
  - `searchExerciseResources.toUserProjection`
  - `visibleTrainingProposalOutputContract`
  - `terminal_reference_invalid` repair 逻辑
- 预期收益：只做最低风险瘦身，预计节省当前同类多轮 trace 的数千级 prompt tokens；大头 manifest / system contract 后续如需优化应另开 change。
