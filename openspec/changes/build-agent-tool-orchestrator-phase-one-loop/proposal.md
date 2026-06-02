## Why

当前旧 Agent 核心层已经计划 delete-only 清理，项目需要按 `docs/agent-tool-orchestrator-design.md` 重建一套干净的 Agent Tool 编排器。第一阶段不能只是骨架或占位，而要形成可运行闭环：后续新增业务能力时，只需要新增单一职责 tool 并注册到 registry，就能让 LLM 在通用编排循环中调用它。

## What Changes

- **BREAKING** 新建 Agent Tool 编排器核心，不继承旧 `AgentOrchestrator`、旧 `AgentExecutionResult`、旧 tool 外壳、旧 response writer 或旧兼容事件。
- **BREAKING** 如果旧代码残留、旧 OpenSpec change 或旧测试夹具与新设计冲突，实现阶段必须无条件忽略旧实现，以 `docs/agent-tool-orchestrator-design.md` 和本 change 为准。
- 新增通用 `defineTool`、`ToolRegistry`、tool manifest 序列化、input/output schema 校验和 resource contract 校验。
- 新增 Planner 输出 `AgentAction` 的模型协议，支持多轮 tool call、`maxSteps`、timeout、防循环和结构化终止结果。
- 新增 Policy Guard、confirmation action hash、resource role、Response Adapter、trace/replay fixture 和 `/api/chat` NDJSON 接入。
- 第一阶段必须至少注册并跑通三类基础工具：动作推荐候选检索、读取 conversation artifact payload、保存 conversation artifact。
- 新增扩展验收：新增 tool 时不得修改 orchestrator 主循环、planner 循环、executor、policy guard 或 `/api/chat` 接入层；只允许新增 tool manifest、schema、handler、resource contract、policy metadata 和 response adapter 映射。

## Capabilities

### New Capabilities
- `agent-tool-orchestrator-core`: 定义新 Agent Tool 编排器第一阶段完整闭环，包括 tool 定义/注册、manifest、schema/resource 校验、多轮 planner loop、policy/confirmation、response adapter、trace/replay、`/api/chat` NDJSON 接入和只注册 tool 即可扩展的硬验收。

### Modified Capabilities
- 无。本 change 不修改旧 `tool-first-agent-orchestrator`、`agent-runtime-resource-contract` 或 `agent-tool-capability-contract`；这些旧能力由 `remove-current-agent-core-layer` 清理。新实现使用新的 `agent-tool-orchestrator-core` 规格表达。

## Impact

- 影响代码范围：新增或重建 `lib/server/agent-core/**`、`lib/server/agent-tools/**`、`lib/server/chat/chat-service.ts` 的新 core 接入、`app/api/chat/route.ts` 的 NDJSON 边界，以及相关 trace/replay 测试。
- 影响工具范围：第一阶段必须实现动作候选检索、读取 artifact、保存 artifact 三类基础工具；后续工具只能通过注册扩展，不得改 orchestrator 主流程。
- 影响 AI 契约：新增 Planner `AgentAction` structured output、tool manifest 输入、observation 压缩、final answer / ask user / confirmation 终止结构。
- 影响测试范围：新增架构级扩展测试、多轮 tool call 测试、schema/resource/policy 校验测试、`/api/chat` NDJSON 集成测试和 replay fixture。
- 不影响数据库 schema；底层动作检索、artifact 持久化、policy/confirmation 和 user/session 权限服务可复用，但旧 Agent 包装层不可复用。
