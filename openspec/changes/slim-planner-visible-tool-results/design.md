## Context

当前 `runAgentRuntime` 在每次 Planner 调用前构造 `plannerContext`，其中 `toolResults` 来自 `toolResults.map(redactToolResultForPlanner)`。现有 `redactToolResultForPlanner` 只把成功结果的 `output` 改成 `"[redacted]"`，其余运行时字段仍沿用完整 `ToolResult` 结构进入模型可见上下文。

这导致 Planner 下一轮可以看到不必要字段，例如 `projection.user`、完整 `input`、`toolCallId`、`toolVersion`、`normalizedInputHash`、`startedAt`、`completedAt` 和占位 `output`。这些字段服务于执行、trace、replay 或用户展示，不是 Planner 判断下一步 action 的必要事实。

本 change 属于 `context / observation 投影` 类型的模型可见合同变化，同时触碰 `PlannerPort` 输入类型边界。设计必须保留 `docs/agent-tool-orchestrator-design.md` 的核心约束：core 不写业务 `toolName` 分支，Planner 只接收安全事实投影，完整 runtime 结果仍留给服务端校验、trace、replay 和 renderer。

## Goals / Non-Goals

**Goals:**

- 为 Planner 可见 tool result 建立专用瘦身类型，避免用完整 `ToolResult` 伪装模型输入。
- 成功 tool result 只向 Planner 暴露 `toolName`、`toolResultId`、`ok`、`fulfillment`、`projection.model` 和必要 resource 引用。
- 失败 tool result 保留模型恢复所需的错误码、retryable、summary 和必要引用，但不暴露完整 handler output 或执行元数据。
- 完整 `ToolResult` 继续保留在 `AgentRunResult`、trace、replay 和 renderer 路径中。
- 添加测试证明 Planner 输入被瘦身，同时最终运行结果仍保留完整投影。

**Non-Goals:**

- 不修改 `terminal_reference_invalid`、repair feedback 或 repair prompt。
- 不压缩 `ToolRegistry.serializeForPlanner()` 产生的 tool manifest。
- 不修改任何业务 tool 的 `inputSchema`、`outputSchema`、`whenToUse`、`whenNotToUse`、examples 或 metadata。
- 不压缩 `visibleTrainingProposalOutputContract` 或 system prompt。
- 不改变 Action Validator、ResourceStore、Policy Guard、Response Renderer 的语义。
- 不新增服务端自然语言关键词、短句模板、同义词或业务 `toolName` 特判。

## Decisions

### 1. 新增 Planner 专用 tool result 类型

新增 `PlannerVisibleToolResult` 或等价类型，并将 `PlannerContext.toolResults` / `PlannerPort` 输入中的 tool result 类型从完整 `ToolResult[]` 改为该瘦身类型。

选择理由：
- 类型层面阻止完整 `ToolResult` 再次被直接塞入模型输入。
- 让模型可见合同和 runtime 内部执行合同分离，后续压缩策略更容易测试。

替代方案：
- 继续返回 `ToolResult` 但把更多字段设为 `undefined`。该方案类型上仍允许误用完整字段，容易回归。

### 2. 用白名单构造 Planner 可见结果

将 `redactToolResultForPlanner` 调整为白名单投影函数，例如 `toPlannerVisibleToolResult`。成功结果仅保留：

```txt
toolName
toolResultId
ok
fulfillment
projection.model
必要的 producedResources / consumedResources 引用
```

失败结果仅保留：

```txt
toolName
toolResultId
ok
error.code
error.retryable
error.details 的安全摘要，如现有 redaction 允许
fulfillment
projection.model，如存在
```

选择理由：
- 白名单比黑名单更符合模型输入安全边界。
- `projection.model` 是 tool 已经为模型决策准备的事实通道；`projection.user` 属于用户展示投影，不应重复进入 Planner。

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

## Risks / Trade-offs

- [Risk] 某些测试或 planner fixture 仍假设 `toolResults` 是完整 `ToolResult[]`。
  Mitigation: 更新 PlannerPort / PlannerContext 类型，并补充 runtime 输入投影测试，避免隐式依赖。

- [Risk] `fulfillment.producedResources` 与顶层 resource refs 出现重复或缺失。
  Mitigation: 只保留现有 validator grounding 必需的引用字段，并用测试覆盖 terminal grounding 仍可读取 current-run tool result。

- [Risk] 失败 tool result 过度瘦身导致模型缺少恢复信息。
  Mitigation: 失败结果仍保留结构化错误码、retryable、fulfillment summary 和安全 details；不在本 change 改 repair 语义。

- [Risk] token 节省低于 manifest/system 级压缩。
  Mitigation: 本 change 明确定位为最低风险瘦身；manifest 和 output contract 压缩另开 change。

## Migration Plan

1. 增加 Planner 可见 tool result 类型和投影函数。
2. 将 runtime 构造 Planner 输入的位置切换到新投影函数。
3. 更新 `PlannerPort`、测试 fixture 和相关类型引用。
4. 添加测试断言 Planner 输入不包含用户展示投影和执行元数据。
5. 运行 OpenSpec 校验、Agent runtime 相关测试和 `npm run typecheck`。

Rollback 策略：如果发现模型上下文缺少必要事实，可回退投影函数到保留更多 `projection.model` 内字段，但不恢复 `projection.user` 和执行元数据作为默认模型输入。
