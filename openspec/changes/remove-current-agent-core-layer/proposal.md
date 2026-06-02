## Why

当前 Agent 主链已经偏离“通用编排器 + 单一职责 tool”的目标：`runtime`、tool 外壳、资源恢复、训练 artifact 投影和具体业务工具名相互绑定，继续在现有核心层上抽象会叠加旧合同、新合同和兼容逻辑，反而让架构更难维护。

本项目当前没有生产用户负担，可以直接删除现有 Agent 核心层，以底层领域服务和已沉淀的资源合同经验为输入，后续重新建立干净的 Agent core。

## What Changes

- **BREAKING** 删除当前 Agent 核心层作为 `/api/chat` 的执行基础，包括旧 `runAgentOrchestrator()`、旧 `AgentExecutionResult` 终止合同、旧 Agent tool 外壳、旧 tool registry、旧 response writer 绑定逻辑和旧业务恢复逻辑。
- **BREAKING** 删除现有 Agent tools，而不是继续兼容或在其上重构；后续新 tools 必须按单一职责重新定义。
- **BREAKING** 当前 `tool-first-agent-orchestrator`、`agent-runtime-resource-contract`、`agent-tool-capability-contract` 中绑定旧 runtime、旧 tool 名、`generated/patched` artifact 收口和业务恢复策略的要求将被移除或替换。
- 保留底层领域服务作为后续新 core 可复用基础，包括动作检索、artifact 持久化、训练校验、policy/confirmation、user memory、trace/黑盒经验。
- 保留 `/api/chat` 的认证、请求校验、服务端 hydration、NDJSON 流式协议和 trace 入口作为后续新 core 的接入边界；实现阶段可临时返回可恢复错误，但不得回退到旧 Agent core。
- 新增删除边界文档，明确哪些模块必须删除、哪些模块只作为领域服务保留、哪些旧规格必须失效。

## Capabilities

### New Capabilities
- `agent-core-removal`: 定义删除当前 Agent 核心层的范围、保留边界、禁止兼容层和验收标准。

### Modified Capabilities
- `tool-first-agent-orchestrator`: 移除旧 Tool-first `AgentOrchestrator` 作为生产 `/api/chat` 主链的要求，废止旧 `AgentExecutionState`、旧 `AgentExecutionResult`、旧 Response Writer 和具体训练工具链绑定。
- `agent-runtime-resource-contract`: 移除旧 runtime 资源合同中绑定具体 tool name、`generated/patched`、旧 partial candidate 和旧澄清投影的要求；保留“可消费资源 vs 诊断资源”作为后续新 core 经验而非旧 runtime 实现要求。
- `agent-tool-capability-contract`: 移除旧 Agent tool capability contract 对当前旧 tool 外壳的约束；后续能力合同应由新单一职责 tool manifest 重新定义。

## Impact

- 影响代码范围：`lib/server/agent-orchestrator/**`、`lib/server/chat/chat-service.ts` 中旧 Agent 调用链、旧 response writer、旧 activity 映射、旧 tool 注册和相关测试夹具。
- 影响规格范围：`tool-first-agent-orchestrator`、`agent-runtime-resource-contract`、`agent-tool-capability-contract` 及其依赖旧 Agent core 的测试要求。
- 影响测试范围：现有 `tests/agent-orchestrator.test.ts`、`tests/chat-service.test.ts`、Agent activity / trace / 黑盒测试中依赖旧 tool name、旧 final result、旧 resource id 的断言需要删除或改为新 core 后重新建立。
- 不影响底层领域服务：动作库、训练校验、artifact 持久化、policy/confirmation、user memory、数据库模型和现有业务服务不在本 change 的删除目标内。
