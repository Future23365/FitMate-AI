## Context

当前 `runAgentRuntime` 每轮构造 `PlannerInput` 时会同时传入：

```ts
observations: compressPlannerObservations(observations),
toolResults: toolResults.map(redactToolResultForPlanner),
```

成功 tool result 的 `projection.model` 当前会通过 `createToolObservation()` 进入 `observations[].content`，同时也通过 redacted `toolResults[].projection.model` 进入 `toolResults`。由于 `observations` 会按通用字符预算压缩，而 `toolResults` 仍保留 projection，模型可能看到同一事实的两种版本：一份被截断或轻微变形，一份更完整。这个问题不需要完整 `PlannerStateView` 才能缓解，可以先在现有 `PlannerInput` 边界做去重。

本 change 的 primary governance 调整为 `agent-tool-change-governance` 的 core contract 小改，secondary governance 为 `agent-prompt-contract-governance` 的 context / observation / model input 检查。它涉及 `runtime.ts`、`observation.ts`、`contracts.ts` / `planner-port.ts` 和 model adapter 的模型输入构造，但不改变 `PlannerPort.decideNext(input)` 方法签名、Executor、Policy Guard、ResourceStore、Response Renderer、`/api/chat` 主链路或业务 tool handler。

## Goals / Non-Goals

**Goals:**

- 成功 tool result 的详细 facts 只通过一个权威模型输入通道传递。
- 保留 `toolResults[].projection.model` 作为成功 tool facts 的详细安全通道。
- 将成功 tool result 的 `observations` 降级为轻量索引和导航摘要。
- 保留 failed / diagnostic / invalid action / runtime error / duplicate feedback observation 的完整修复价值。
- 保持 `PlannerPort.decideNext(input)` 方法签名兼容。
- 补测试和 trace 摘要，让后续能确认模型输入没有再双通道重复。

**Non-Goals:**

- 不实现完整 `AgentLoopState` / `PlannerStateView`。
- 不新增 terminal outcome、`TerminalGate` 或 `AgentAction` schema 字段。
- 不新增 `PlannerInput` 字段。
- 不实现跨 run / 跨会话的任务状态机。
- 不改变业务 tool handler、tool schema、ToolRegistry 注册方式或数据库查询语义。
- 不改 `/api/chat` 请求/响应外部 schema 和 stream event contract。
- 不新增服务端关键词、正则、同义词表、用户 phrasing 特判、固定 `toolName` 调用顺序或业务 toolName 分支。
- 不把 routine / plan / exercise_selection 的语义判断写进 core。

## Decisions

### Decision 1: 保留 `toolResults` 作为成功 facts 的详细权威通道

当前 `redactToolResultForPlanner()` 已经把完整 handler `output` 替换为 `"[redacted]"`，但保留安全 projection 和 fulfillment。相比把详细 facts 放进 `observations`，保留在 `toolResults` 更适合，因为：

- `toolResults` 天然有 `toolResultId`、tool name/version、ok、fulfillment 和 projection 的结构。
- terminal grounding 已经围绕 tool result refs 校验。
- 后续 ReplayPlanner 和 trace 更容易按 tool result 追溯事实来源。

因此实现应让成功且满足的 tool observation 变轻，而不是删除 `toolResults`。

### Decision 2: `observations` 仍保留 repair / diagnostic 主职责

不能简单删除 `observations`，因为它承载了 invalid action、duplicate success feedback、failed tool result、runtime error 和 repair details。这些内容是下一轮模型修复 action 的主要依据。

实现应新增或调整 helper，例如：

```ts
function createToolObservation(result: ToolResult): AgentObservation {
  if (isSatisfiedSuccess(result)) {
    return createSatisfiedToolResultIndexObservation(result);
  }

  return createDiagnosticToolObservation(result);
}
```

命名可以按现有代码风格调整，但行为边界必须清晰。

### Decision 3: 保持 `PlannerPort` 方法外形和 `PlannerInput` 字段稳定

这次小改的关键是现实可落地。如果引入完整 `PlannerStateView`，影响会扩大到 adapter、ReplayPlanner、trace、tests 和后续所有 planner 实现。

因此本 change 保持 `PlannerPort.decideNext(input)` 的单参数方法外形，也不新增 `PlannerInput` 字段：

```ts
type PlannerInput = {
  run: AgentRunInput;
  step: number;
  manifests: ToolManifest[];
  observations: AgentObservation[];
  toolResults: ToolResult[];
};
```

但更新注释、tests 和 model request snapshot，明确：

- `toolResults` 是成功 tool facts 的详细权威通道。
- `observations` 是 repair / diagnostic + successful result index 通道。
- repair / diagnostic 信息仍沿用现有 observation、validator details、resource / grounding error 和 tool fulfillment 结构，不在本 change 中抽成新模型输入字段。

### Decision 4: trace 摘要只记录去重证据，不记录完整 payload

trace 不应为了证明去重而存完整模型 payload。实现可以在 model request trace 中增加或派生这些安全摘要：

- `observationCount`
- `toolResultCount`
- `successfulToolResultIndexObservationCount`
- `repairDiagnosticObservationCount`
- `toolResultProjectionCount`

字段名可按现有 trace 类型调整，但必须能让日志排查者判断：成功 facts 是否只在一个详细通道里。

### Decision 5: 不在 core 内写业务 toolName 例外

去重规则应按通用状态判断：

- `result.ok === true`
- `result.fulfillment.satisfied === true`
- `result.projection.model` 是否存在

不应写 `searchExerciseResources`、`inspectVisibleTrainingProposals` 或其他业务 toolName 分支。业务 tool 如果需要模型看到更好的 facts，应改自己的 `projection.model`，不是改 core 去特殊处理它。

## Risks / Trade-offs

- [Risk] 成功 observation 变轻后，模型少看一份冗余事实，短期可能依赖旧 observation 的测试失败。→ Mitigation：更新 snapshot 和 ReplayPlanner 输入测试，明确详细 facts 在 `toolResults` 中仍可见。
- [Risk] 某些 adapter 或 prompt 文案仍强调 `observations` 是 facts 来源。→ Mitigation：同步检查 prompt / model input 说明，把成功 facts 的权威来源改成 `toolResults`，repair / diagnostic 仍看 `observations`。
- [Risk] trace 摘要不足以定位实际 payload。→ Mitigation：保留现有 request message contentRef / 摘要机制，同时新增去重相关计数和 projection presence。
- [Risk] 未来仍需要完整状态视图。→ Mitigation：这个 change 不阻塞后续独立评估；它只是先去掉当前最明显的重复输入。

## Migration Plan

1. 新增或调整成功 tool result 的 lightweight observation helper。
2. 更新 `createToolObservation()`，让 satisfied success 走轻量索引，failed / diagnostic / unsatisfied 保持结构化 details。
3. 保持 `redactToolResultForPlanner()` 对完整 `output` 的 redaction，并确认 `projection.model` 留在 `toolResults`。
4. 更新 model adapter request trace 摘要，记录或派生去重证据。
5. 更新 agent-core / model adapter / trace tests，断言成功 facts 不再双通道重复。
6. 运行 OpenSpec、相关测试和 typecheck。

## Open Questions

- 成功 lightweight observation 是否需要包含 `projection.model` 的顶层 key 清单，还是只说明“详细事实见 toolResults”，实现时可通过 snapshot 决定最小可读结构。
- trace 去重计数字段是落在 adapter trace 的 `run` 摘要里，还是落在 runtime trace event 里，需要按现有 trace viewer 消费方式选择。
