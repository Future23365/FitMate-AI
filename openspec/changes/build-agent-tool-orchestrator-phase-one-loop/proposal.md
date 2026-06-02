## Why

当前旧 Agent 核心层已经计划 delete-only 清理，项目需要按 `docs/agent-tool-orchestrator-design.md` 重建一套干净的通用 Agent Tool 编排器。第一阶段必须一次性完成完整编排闭环，但不提前实现任何业务 tool；目标是保证后续只要新增并注册 tool bundle，就能支撑业务扩展。

## What Changes

- **BREAKING** 新建通用 Agent Tool 编排器核心，不继承旧 `AgentOrchestrator`、旧 `AgentExecutionResult`、旧 tool 外壳、旧 response writer 或旧兼容事件。
- **BREAKING** 如果旧代码残留、旧 OpenSpec change 或旧测试夹具与新设计冲突，实现阶段必须无条件忽略旧实现，以 `docs/agent-tool-orchestrator-design.md` 和本 change 为准。
- 第一阶段完整实现通用闭环能力：`defineTool`、`ToolRegistry`、tool manifest 序列化、input/output schema 校验、resource contract 校验、Planner 输出 `AgentAction`、多轮 tool call、`maxSteps` / timeout 防死循环、`consumable` / `diagnostic` 资源角色、Policy Guard、confirmation action hash、Response Adapter、trace / replay fixture、`/api/chat` NDJSON 接入。
- 第一阶段不实现具体业务 tool；只提供通用 tool bundle 定义、注册机制和无业务 fixture tools，用于证明注册、调用、资源生产/消费、确认、失败收口、response projection 和 replay 都能端到端运行。
- 新增扩展验收：新增 tool 时不得修改 orchestrator 主循环、Planner 循环、Executor、Policy Guard、Resource Contract Validator、Response Adapter 主流程或 `/api/chat` 接入层；扩展只能通过新增 tool manifest、schema、handler、resource contract、policy metadata、trace projection 和 response adapter 完成。

## Capabilities

### New Capabilities
- `agent-tool-orchestrator-core`: 定义新 Agent Tool 编排器第一阶段完整通用闭环，包括 core contracts、tool bundle 定义/注册、manifest、schema/resource 校验、多轮 planner loop、policy/confirmation、response adapter、trace/replay、`/api/chat` NDJSON 接入和只注册 tool 即可扩展的硬验收。

### Modified Capabilities
- 无。本 change 不修改旧 `tool-first-agent-orchestrator`、`agent-runtime-resource-contract` 或 `agent-tool-capability-contract`；这些旧能力由 `remove-current-agent-core-layer` 清理。新实现使用新的 `agent-tool-orchestrator-core` 规格表达。

## Impact

- 影响代码范围：新增或重建 `lib/server/agent-core/**`、`lib/server/agent-tools/index.ts`、`lib/server/chat/chat-service.ts` 的新 core 接入、`app/api/chat/route.ts` 的 NDJSON 边界，以及相关 trace/replay 测试。
- 影响工具范围：第一阶段只实现通用 tool 定义、registry、manifest、contract、adapter 和测试 fixture；不提前实现业务 tool。
- 影响 AI 契约：新增 Planner `AgentAction` structured output、tool manifest 输入、observation 压缩、final answer / ask user / confirmation 终止结构。
- 影响测试范围：新增架构级扩展测试、多轮 tool call 测试、schema/resource/policy 校验测试、`/api/chat` NDJSON 集成测试和 replay fixture。
- 不影响数据库 schema；业务服务不作为本 change 的实现范围。
