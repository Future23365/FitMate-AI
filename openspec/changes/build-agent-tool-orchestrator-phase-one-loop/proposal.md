## Why

当前旧 Agent 核心层已经计划 delete-only 清理，项目需要按 `docs/agent-tool-orchestrator-design.md` 重建一套干净的 Agent Tool 编排器。第一阶段必须一次性完成完整闭环，而不是只做骨架、局部工具测试或临时过渡：新 core 要能真实接入 `/api/chat`，完成 Planner、tool call、resource contract、Policy、Response Adapter、trace/replay 和 NDJSON 输出，并证明后续新增业务能力只需要新增并注册单一职责 tool。

## What Changes

- **BREAKING** 新建 Agent Tool 编排器核心，不继承旧 `AgentOrchestrator`、旧 `AgentExecutionResult`、旧 tool 外壳、旧 response writer 或旧兼容事件。
- **BREAKING** 如果旧代码残留、旧 OpenSpec change 或旧测试夹具与新设计冲突，实现阶段必须无条件忽略旧实现，以 `docs/agent-tool-orchestrator-design.md` 和本 change 为准。
- 第一阶段必须完整实现 `docs/agent-tool-orchestrator-design.md` 第 28 节列出的 15 项闭环能力：`defineTool`、`ToolRegistry`、tool manifest 序列化、input/output schema 校验、resource contract 校验、Planner 输出 `AgentAction`、多轮 tool call、`maxSteps` / timeout 防死循环、`consumable` / `diagnostic` 资源角色、Policy Guard、confirmation action hash、Response Adapter、trace / replay fixture、`/api/chat` NDJSON 接入、动作推荐 / 读取 artifact / 保存 artifact 三类基础工具。
- 新增通用 Agent runtime，完成从 `/api/chat` 请求到 terminal action、tool results、用户可见 NDJSON 事件和 trace/replay 的端到端闭环。
- 新增扩展验收：新增 tool 时不得修改 orchestrator 主循环、Planner 循环、Executor、Policy Guard、Resource Contract Validator、Response Adapter 主流程或 `/api/chat` 接入层；扩展只能通过新增 tool manifest、schema、handler、resource contract、policy metadata、trace projection 和 response adapter 完成。
- 三类基础工具是第一阶段完整闭环的验收样例，不是把第一阶段降级成只支持三类业务；core 必须具备后续注册更多 tool 的完整扩展能力。

## Capabilities

### New Capabilities
- `agent-tool-orchestrator-core`: 定义新 Agent Tool 编排器第一阶段完整闭环，包括第 28 节 15 项能力、端到端 `/api/chat` 可运行链路、三类基础工具验收、trace/replay 复现和只注册 tool 即可扩展的硬验收。

### Modified Capabilities
- 无。本 change 不修改旧 `tool-first-agent-orchestrator`、`agent-runtime-resource-contract` 或 `agent-tool-capability-contract`；这些旧能力由 `remove-current-agent-core-layer` 清理。新实现使用新的 `agent-tool-orchestrator-core` 规格表达。

## Impact

- 影响代码范围：新增或重建 `lib/server/agent-core/**`、`lib/server/agent-tools/**`、`lib/server/chat/chat-service.ts` 的新 core 接入、`app/api/chat/route.ts` 的 NDJSON 边界，以及相关 trace/replay 测试。
- 影响工具范围：第一阶段必须实现动作候选检索、读取 artifact、保存 artifact 三类基础工具作为验收样例；同时必须提供完整 tool bundle 扩展机制，后续工具只能通过注册扩展，不得改 orchestrator 主流程。
- 影响 AI 契约：新增 Planner `AgentAction` structured output、tool manifest 输入、observation 压缩、final answer / ask user / confirmation 终止结构。
- 影响测试范围：新增架构级扩展测试、多轮 tool call 测试、schema/resource/policy 校验测试、`/api/chat` NDJSON 集成测试和 replay fixture。
- 不影响数据库 schema；底层动作检索、artifact 持久化、policy/confirmation 和 user/session 权限服务可复用，但旧 Agent 包装层不可复用。
