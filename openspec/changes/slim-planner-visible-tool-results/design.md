## Context

当前 `runAgentRuntime` 在每次 Planner 调用前构造 `plannerContext`，其中 `toolResults` 来自 `toolResults.map(redactToolResultForPlanner)`。现有 `redactToolResultForPlanner` 只把成功结果的 `output` 改成 `"[redacted]"`，其余运行时字段仍沿用完整 `ToolResult` 结构进入模型可见上下文。

这导致 Planner 下一轮可以看到不必要字段，例如 `projection.user`、`toolCallId`、`toolVersion`、`idempotencyKey`、`normalizedInputHash`、`startedAt`、`completedAt` 和占位 `output`。这些字段服务于执行、trace、replay 或用户展示，不是 Planner 判断下一步 action 的必要事实。

本 change 属于 `context / observation 投影` 类型的模型可见合同变化，同时触碰 `PlannerPort` 输入类型边界。设计必须保留 `docs/agent-tool-orchestrator-design.md` 的核心约束：core 不写业务 `toolName` 分支，Planner 只接收安全事实投影，完整 runtime 结果仍留给服务端校验、trace、replay 和 renderer。

## Goals / Non-Goals

**Goals:**

- 为 Planner 可见 tool result 建立专用低风险瘦身类型，避免用完整 `ToolResult` 伪装模型输入。
- 成功 tool result 原样保留 `toolName`、`toolResultId`、`ok`、`fulfillment`、`projection.model` 和 `fulfillment` 中已有的 resource 引用 / unmet requirements。
- 失败 tool result 原样保留 `error`、`fulfillment` 和恢复所需 details；本 change 至多移除执行元数据，不压缩失败语义。
- 完整 `ToolResult` 继续保留在 `AgentRunResult`、trace、replay 和 renderer 路径中。
- 添加测试证明 Planner 输入被瘦身，同时最终运行结果仍保留完整投影。

**Non-Goals:**

- 不修改 `terminal_reference_invalid`、repair feedback 或 repair prompt。
- 不压缩 `ToolRegistry.serializeForPlanner()` 产生的 tool manifest。
- 不修改任何业务 tool 的 `inputSchema`、`outputSchema`、`whenToUse`、`whenNotToUse`、examples 或 metadata。
- 不压缩 `visibleTrainingProposalOutputContract` 或 system prompt。
- 不删除、压缩或改写 `projection.model` 内的 `query`、`appliedFilters`、`filterApplications`、`groups`、`allowedSections`、resource 引用或其他业务事实。
- 不压缩失败 tool result 的 `error`、`fulfillment` 或 repair 恢复信息。
- 不以删除完整 tool input 为目标；当前 `ToolResult` 合同本身不携带完整 input，若未来出现 input 回显，应另行评估模型理解风险。
- 不改变 Action Validator、ResourceStore、Policy Guard、Response Renderer 的语义。
- 不新增服务端自然语言关键词、短句模板、同义词或业务 `toolName` 特判。

## Decisions

### 1. 新增 Planner 专用 tool result 类型

新增 `PlannerVisibleToolResult` 或等价类型，并将 `PlannerContext.toolResults` / `PlannerPort` 输入中的 tool result 类型从完整 `ToolResult[]` 改为该低风险瘦身类型。

选择理由：
- 类型层面阻止完整 `ToolResult` 再次被直接塞入模型输入。
- 让模型可见合同和 runtime 内部执行合同分离，后续压缩策略更容易测试。

替代方案：
- 继续返回 `ToolResult` 但把更多字段设为 `undefined`。该方案类型上仍允许误用完整字段，容易回归。

### 2. 用白名单构造 Planner 可见结果

将 `redactToolResultForPlanner` 调整为白名单投影函数，例如 `toPlannerVisibleToolResult`。成功结果保留：

```txt
toolName
toolResultId
ok
fulfillment
projection.model
fulfillment.producedResources
fulfillment.consumedResources
fulfillment.unmetRequirements
```

失败结果保留 `error` 与 `fulfillment` 的现有语义，只移除执行元数据：

```txt
toolName
toolResultId
ok
error
fulfillment
```

选择理由：
- 白名单比黑名单更符合模型输入安全边界。
- `projection.model` 是 tool 已经为模型决策准备的事实通道；`projection.user` 属于用户展示投影，不应重复进入 Planner。
- 本 change 不裁剪模型事实、resource 引用或失败恢复信息，因此只保留基本不影响大模型理解的字段移除。

替代方案：
- 删除整个 `projection`，只保留 observations。该方案 token 更省，但会让模型失去详细事实，风险高于当前最低风险目标。

### 3. 完整结果只在服务端内部路径保留

`toolResults` 原始数组仍保存完整 `ToolResult`，用于：

```txt
AgentRunResult
trace / replay
Response Renderer
terminal output validator
后续服务端 deterministic 校验
```

Planner 输入使用单独投影数组，不反向修改原始数组。

选择理由：
- 避免 token 优化影响用户展示和审计能力。
- 保持 runtime 执行证据完整，便于回放和问题定位。

替代方案：
- 在执行结果入库时直接删除字段。该方案会破坏 trace / renderer / replay 边界，不采用。

### 4. 不做动态 tool 裁剪

本 change 不按用户意图、历史输入或业务 `toolName` 动态隐藏 tool，也不改 manifest 内容。

选择理由：
- tool 调用能力主要依赖 manifest、schema 和 examples；保持不动可以降低理解力回退风险。
- 动态 tool 裁剪需要更完整的能力路由设计，不属于这次最低风险优化。

## Planner 输入投影示例

### 改动前：完整 `ToolResult` 只替换 `output`

现有 `redactToolResultForPlanner` 的风险在于它仍把完整执行对象形状暴露给 Planner，只是将原始 `output` 改成占位值。模型输入中会混入三类非决策字段：

- 用户展示投影：`projection.user`，例如 `imageUrl` 和前端展示摘要。
- 执行 / trace 元数据：`toolCallId`、`toolVersion`、`idempotencyKey`、`normalizedInputHash`、`startedAt`、`completedAt`。
- 重复或无信息字段：`output: "[redacted]"`。

这些字段不会帮助模型判断下一步 `tool_call`、`final_answer` 或 `ask_user`，但会在每轮 Planner 调用中重复消耗 token。

### 改动后：Planner 专用白名单对象

Planner 可见成功结果应构造为白名单对象：

```ts
type PlannerVisibleToolResult = {
  toolName: string;
  toolResultId: string;
  ok: true;
  fulfillment: {
    satisfied: boolean;
    summary: string;
    producedResources?: ToolResult["fulfillment"]["producedResources"];
    consumedResources?: ToolResult["fulfillment"]["consumedResources"];
    unmetRequirements?: ToolResult["fulfillment"]["unmetRequirements"];
  };
  projection?: {
    model?: JsonValue;
  };
};
```

失败结果也使用白名单对象：

```ts
type PlannerVisibleFailedToolResult = {
  toolName: string;
  toolResultId: string;
  ok: false;
  error: Extract<ToolResult, { ok: false }>["error"];
  fulfillment: ToolResult["fulfillment"];
};
```

最终类型可以按项目现有 `ToolResult` 判别方式调整命名，但必须保持“Planner 可见类型”和“runtime 内部完整类型”分离。

## 模型理解力影响评估

本 change 属于 `docs/llm-prompt-guidance.md` 中的 Runtime Context 压缩，不属于 Tool Manifest 压缩。模型 tool calling 能力主要依赖 `tools[]` manifest 中的 `name`、`description`、`inputJsonSchema`、`whenToUse`、`whenNotToUse` 和 examples；这些全部保持不变。

模型对已执行结果的理解依赖 `projection.model`，而不是 `projection.user`。业务 tool 已通过 `toModelObservation` / model projection 给 Planner 准备可消费事实，用户展示投影继续留给 renderer 和 trace。因此：

- 查询结果、动作事实、section 边界、`allowedSections`、`fulfillment.satisfied` 等模型决策事实必须继续保留。
- `imageUrl`、展示摘要、执行时间、hash、执行 id、占位 output 等非决策字段不应进入 Planner。
- 本 change 不删除完整 input、不裁剪失败恢复信息、不压缩 resource 引用；如果后续要继续压缩这些字段，必须另开 change 重新评估模型理解风险。

## Token 估算与验收口径

本 change 不承诺解决 system prompt / manifest 的主要 token 占用。它的成功标准是：

- Planner 输入中 `toolResults` 字符数下降。
- 成功结果不再包含 `projection.user` 和执行元数据。
- `projection.model`、`fulfillment`、resource 引用和失败恢复信息保持原样。
- `AgentRunResult`、trace、replay 和 renderer 仍可访问完整结果。

以当前真实 trace 粗估，`searchExerciseResources` 的 `projection.user` 单项约 3485 chars；移除它和执行元数据后，每个后续 Planner 调用可节省数百到千级 prompt tokens。该收益应通过新增或当前 trace 的 `toolResultsChars` / `plannerVisibleToolResultsChars` 对比记录验证。

## Risks / Trade-offs

- [Risk] 某些测试或 planner fixture 仍假设 `toolResults` 是完整 `ToolResult[]`。
  Mitigation: 更新 PlannerPort / PlannerContext 类型，并补充 runtime 输入投影测试，避免隐式依赖。

- [Risk] `fulfillment.producedResources` 与顶层 resource refs 出现重复或缺失。
  Mitigation: 本 change 不裁剪 `fulfillment.producedResources`、`fulfillment.consumedResources` 或 `fulfillment.unmetRequirements`，只测试其在 Planner 输入和 runtime 原始结果中保持原样。

- [Risk] 实现时误压缩失败恢复信息导致模型缺少恢复依据。
  Mitigation: 本 change 不压缩失败结果的 `error`、`fulfillment` 或 repair 恢复信息；失败结果最多移除执行元数据。

- [Risk] token 节省低于 manifest/system 级压缩。
  Mitigation: 本 change 明确定位为最低风险瘦身；manifest 和 output contract 压缩另开 change。

## Migration Plan

1. 增加 Planner 可见 tool result 类型和低风险投影函数。
2. 将 runtime 构造 Planner 输入的位置切换到新投影函数。
3. 更新 `PlannerPort`、测试 fixture 和相关类型引用。
4. 添加测试断言 Planner 输入不包含用户展示投影、执行元数据和占位 output，同时保留 `projection.model`、`fulfillment`、resource 引用和失败恢复信息。
5. 运行 OpenSpec 校验、Agent runtime 相关测试和 `npm run typecheck`。

Rollback 策略：如果发现模型上下文缺少必要事实，优先确认是否误删了 `projection.model`、`fulfillment`、resource 引用或失败恢复信息；不得通过恢复 `projection.user`、执行元数据或占位 output 作为默认模型输入来补事实。
