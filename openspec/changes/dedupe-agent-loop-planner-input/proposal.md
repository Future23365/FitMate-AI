## Why

当前 Agent Runtime 每轮给 Planner 同时传入 `observations` 和 `toolResults`，而成功 tool result 的 `projection.model` 会同时出现在两边。这个双通道会让模型看到重复且可能被不同压缩策略处理过的同一事实，增加 token 成本，也让后续排查时难以判断哪一份才是权威模型输入。

本 change 采用小范围方案：不引入完整 `PlannerStateView`、`Evidence` 或 `TerminalGate`，不改 `PlannerPort.decideNext(input)` 方法外形，只把成功 tool result 的详细模型可见事实收敛到单一权威通道，先优化当前 Loop 最明显的输入噪声和事实来源歧义问题。

## What Changes

- 成功且已满足的 tool result 详细模型可见事实继续保留在 `toolResults[].projection.model`。
- 成功 tool result 对应的 `observations` 不再重复携带完整 `projection.model`，只保留轻量索引摘要，例如 `toolResultId`、`toolName`、`ok`、`fulfillment.satisfied`、resource / grounding 摘要和“详细事实见 toolResults”的边界说明。
- failed、diagnostic、`fulfillment.satisfied=false`、invalid action、duplicate success feedback、runtime error 等 repair / diagnostic observation 继续留在 `observations`，因为它们是下一轮修复和澄清的主要输入。
- `redactToolResultForPlanner` 或等价 Planner input builder 继续禁止完整 handler `output` 回灌模型，只允许安全 projection、fulfillment 和可验证引用。
- DeepSeek adapter 或等价 model adapter 继续发送现有单对象 `PlannerInput`；不新增大状态机、不改 `AgentAction` schema。
- trace / model request 摘要需要能证明成功 facts 的权威通道和 observation 轻量化结果，便于后续看 log 时确认模型实际看到了什么。
- 不新增服务端关键词、正则、同义词表、用户 phrasing 特判、固定 `toolName` 调用顺序或业务 toolName 分支。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: production Planner 模型输入必须避免把成功 tool result 的详细事实同时放入 `observations` 和 `toolResults`。
- `agent-tool-contract-kernel`: Runtime 构造 Planner input 时必须区分“成功事实权威通道”和“repair / diagnostic observation 通道”，同时保持 `PlannerPort.decideNext(input)` 方法外形兼容。
- `ai-run-trace`: trace / model request 摘要必须能显示成功 tool facts 没有被双通道重复传递，且不泄漏完整 handler output。

## Impact

- 影响模型实际可见输入：
  - `lib/server/agent-core/runtime.ts`
  - `lib/server/agent-core/observation.ts`
  - `lib/server/agent-core/contracts.ts` / `lib/server/agent-core/planner-port.ts` 的 `PlannerInput` 语义说明或注释
  - `lib/server/agent-planners/model-adapters/deepseek-model-adapter.ts` 的 request snapshot / trace 摘要
- 影响测试：
  - agent-core runtime / Planner input tests
  - observation compression tests
  - model adapter request snapshot tests
  - trace / replay summary tests
- 不影响：
  - `AgentAction` schema
  - `PlannerPort.decideNext(input)` 的方法签名
  - ToolRegistry 注册模式
  - 业务 tool handler、input schema、output schema 和数据库查询语义
  - Policy Guard、ResourceStore、Response Renderer 和 `/api/chat` 外部 stream contract
  - `AgentAction` terminal outcome 或完整 `TerminalGate`
  - `PlannerInput` 新字段
