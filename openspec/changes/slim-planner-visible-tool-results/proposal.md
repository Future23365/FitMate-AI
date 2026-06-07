## Why

最近一次真实 Agent trace 显示，每轮 Planner 输入中 `toolResults` 会把已脱敏但仍接近完整的运行时结果继续发送给模型；其中 `projection.user`、执行元数据和占位 `output: "[redacted]"` 对下一步决策没有必要，却会在多轮 tool calling 中重复消耗 token。

本 change 只保留基本不影响大模型理解的低风险优化：移除 Planner 可见 tool result 中没有业务事实含义的用户展示投影、执行元数据和占位 output；不删除 `projection.model` 中的业务事实，不裁剪 `fulfillment` / resource 引用，不压缩失败恢复信息，不改变 tool manifest、tool schema、`outputContracts`、repair 合同或服务端校验。

## What Changes

- 新增或收紧 Planner 可见 tool result 的专用投影类型，只移除对模型理解没有事实价值的噪音字段。
- `redactToolResultForPlanner` 或等价构造入口从“完整 `ToolResult` 替换 output”改为“构造 Planner 专用低风险瘦身对象”。
- Planner 输入中的成功 tool result SHALL 原样保留 `toolName`、`toolResultId`、`ok`、`fulfillment`、`projection.model` 以及 `fulfillment` 中已有的 resource 引用和 unmet requirements。
- Planner 输入中的成功 tool result SHALL NOT 包含 `projection.user`、`output: "[redacted]"`、`toolCallId`、`toolVersion`、`idempotencyKey`、`normalizedInputHash`、`startedAt`、`completedAt` 等仅供执行、trace、replay 或用户展示使用的字段。
- 本 change SHALL NOT 删除或压缩完整 tool input、失败恢复信息、resource 引用、`projection.model` 内的查询条件摘要、`appliedFilters`、`groups`、`allowedSections` 或其他业务事实字段。
- 完整 `ToolResult` 仍保留在 runtime result、trace、replay 和 renderer 可用路径中，用户展示与审计能力不因本 change 退化。
- 明确不修改 `terminal_reference_invalid` / repair feedback，不压缩 `inputJsonSchema`、`outputJsonSchema`、`whenToUse`、`whenNotToUse` 或 `visibleTrainingProposal` 输出合同。

### Concrete Change Example

当前成功 tool result 进入下一轮 Planner 时，等价于只把原始 `output` 替换成占位符，其他字段仍随完整 `ToolResult` 进入模型输入：

```json
{
  "toolName": "searchExerciseResources",
  "toolVersion": "0.8.0",
  "toolCallId": "...",
  "toolResultId": "...",
  "idempotencyKey": "...",
  "normalizedInputHash": "...",
  "ok": true,
  "output": "[redacted]",
  "projection": {
    "model": {
      "status": "succeeded",
      "factLevel": "section_scoped_exercise_facts"
    },
    "user": {
      "groups": {
        "warmup": {
          "exercises": [{ "exerciseId": "...", "nameZh": "...", "imageUrl": "..." }]
        }
      }
    }
  },
  "fulfillment": {
    "satisfied": true,
    "summary": "..."
  },
  "startedAt": "...",
  "completedAt": "..."
}
```

本 change 后，下一轮 Planner 仍看到同一份模型事实、履约摘要和 resource 引用，只移除无事实价值字段：

```json
{
  "toolName": "searchExerciseResources",
  "toolResultId": "...",
  "ok": true,
  "fulfillment": {
    "satisfied": true,
    "summary": "...",
    "producedResources": [],
    "consumedResources": [],
    "unmetRequirements": []
  },
  "projection": {
    "model": {
      "status": "succeeded",
      "factLevel": "section_scoped_exercise_facts",
      "suitabilities": ["warmup", "stretch"],
      "groups": {
        "warmup": {
          "exercises": [
            {
              "exerciseId": "...",
              "nameZh": "...",
              "allowedSections": ["warmup"]
            }
          ]
        }
      }
    }
  }
}
```

被移出 Planner 输入的字段含义如下：

- `projection.user`：给用户展示、renderer 或 trace 使用的投影，不是模型下一步决策事实来源。
- `startedAt` / `completedAt`：tool 执行时间，用于性能和审计。
- `normalizedInputHash`：标准化 input 的 hash，用于重复调用识别、trace 或 replay。
- `toolCallId` / `toolVersion` / `idempotencyKey`：执行和回放标识；Planner grounding 默认使用 `toolResultId`。
- `output: "[redacted]"`：无业务信息量的占位符。

明确不移出的字段边界如下：

- `projection.model`：模型理解已执行结果的权威事实通道，必须原样保留。
- `fulfillment` 及其 `producedResources`、`consumedResources`、`unmetRequirements`：可能参与 grounding、后续 resource 消费或失败恢复，必须原样保留。
- 失败 result 的 `error` / `fulfillment` / repair 相关 details：可能影响模型恢复或澄清，不能在本 change 中压缩。
- 完整 tool input：当前 `ToolResult` 合同不携带完整 input；本 change 不以删除 input 为目标，也不改变模型理解执行条件的来源。

### Understanding Boundary

本 change 不删除 tool manifest、tool input schema 或 tool 使用说明，因此不降低模型构造合法 tool call 的主要依据。模型调用工具仍依赖：

- 当前 `tools[].name`、`description`、`whenToUse`、`whenNotToUse`。
- `tools[].inputJsonSchema` 和 examples。
- 当前 run 的用户输入、metadata、observations 和 `toolResults[].projection.model`。

本 change 只影响“tool 已执行后，下一轮 Planner 看见哪些结果字段”，不会改变 tool handler、validator、renderer 或用户展示路径。

### Expected Savings

以 `2026-06-07 13:59:05 +08:00` 的真实 trace 为估算基线，`searchExerciseResources` 单个成功 result 中 `projection.user` 约 3485 chars；移除 `projection.user`、执行元数据和占位 output 后，预计每次后续 Planner 调用节省数千字符，折算为数百到千级 prompt tokens。该收益低于 manifest / system contract 压缩，也低于更激进的 result 压缩，但理解风险更低。

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
- 预期收益：只做最低风险瘦身，预计节省当前同类多轮 trace 的数千级 prompt tokens；大头 manifest / system contract 或任何会改变模型事实来源的 result 压缩后续如需优化应另开 change。
