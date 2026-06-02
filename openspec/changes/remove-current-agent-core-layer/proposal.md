## Why

当前代码中的 AI/Agent 运行时已经不再是一个值得继续维护或兼容的基础。旧 `AgentOrchestrator`、tool registry、Prompt、模型调用、Response Writer、AI trace、黑盒测试和聊天执行入口互相绑定，继续保留任何一段都会让后续实现误以为旧流程仍是系统事实来源。

本阶段目标不是在旧 Agent core 上重构，也不是为新 core 留兼容层，而是把运行时代码中的旧 AI/Agent 流程整体下线。页面壳、历史文档和非 AI 公共领域能力可以保留；除文档外，所有旧 Agent 流程、AI 调用链、核心链路测试和旧业务包装都应删除。

## What Changes

- **BREAKING** 删除所有运行时 AI/Agent 执行逻辑，而不只是 `lib/server/agent-orchestrator/**`。删除范围包括旧 `runAgentOrchestrator()`、旧 `AgentExecutionResult`、旧 Agent tools、旧 tool registry、旧 Prompt / 模型调用协议、旧 Response Writer、旧 AI trace 生产、旧 activity 映射、旧资源恢复和旧业务投影。
- **BREAKING** `/api/chat` 不再提供 AI 生成、Agent 执行、tool calling、artifact 生成、summary 更新或旧 NDJSON Agent 事件。页面可以保留，但不得继续调用旧 AI 执行函数。
- **BREAKING** 删除依赖旧核心链路的测试、fixture、manual LLM 黑盒 runner 和内部 Agent 断言。旧测试不改造成兼容测试，也不作为当前运行时资产保留。
- **BREAKING** 当前 `tool-first-agent-orchestrator`、`agent-runtime-resource-contract`、`agent-tool-capability-contract` 中所有绑定旧 Agent/AI 运行时的要求将被移除。未来如需重新引入 AI，必须另起 OpenSpec change 并从空白运行时边界重新设计。
- 保留页面和组件壳，使现有 UI 可以继续存在；涉及 AI 接口、提交函数、流式解析、旧 Agent 事件消费的依赖应删除、断开或改为非 AI 的静态/禁用状态。
- 保留历史文档，包括 `docs/**`、OpenSpec 历史归档和本 change 文档。文档只记录历史，不代表运行时兼容要求。
- 只保留真正公共、非 AI、无旧 Agent 业务逻辑的领域模块。只要模块包含旧 Agent/AI 业务包装、旧 tool 语义、旧执行合同或旧链路投影，就必须删除或拆出纯公共能力后删除耦合部分。
- 其他仍引用旧 Agent core 的 open changes 不作为本 change 的阻塞条件；实现本 change 时以本 change 的删除边界为准，其去留由人工另行决定。

## Capabilities

### New Capabilities
- `agent-core-removal`: 定义运行时 AI/Agent 逻辑整体删除的范围、页面与文档保留边界、禁止兼容层和验收标准。

### Modified Capabilities
- `tool-first-agent-orchestrator`: 移除旧 Tool-first `AgentOrchestrator` 作为生产 `/api/chat` 主链的全部要求，废止旧 `AgentExecutionState`、旧 `AgentExecutionResult`、旧 Response Writer、旧 tool registry、旧 Prompt 和具体训练工具链绑定。
- `agent-runtime-resource-contract`: 移除旧 runtime 资源合同中绑定具体 tool name、`generated/patched`、旧 resource role、旧 partial candidate、旧澄清投影和旧 trace 字段的要求。
- `agent-tool-capability-contract`: 移除旧 Agent tool capability contract、旧 `ToolRequest`、旧 `ToolResult` 和旧 tool 执行证据要求。

## Impact

- 影响代码范围：`lib/server/agent-orchestrator/**`、`lib/server/ai/**` 中旧 Prompt / token / 模型调用相关逻辑、`lib/server/chat/chat-service.ts` 中 AI 执行链、`app/api/chat/**` 中 AI 接口能力、AI trace 生产逻辑、旧 Agent activity / response writer / stream event 绑定，以及所有旧 Agent/LLM 测试夹具。
- 影响 UI 范围：聊天页面、开发 trace 页面和相关组件需要保留页面结构，但必须断开旧 AI 调用、旧 Agent stream、旧 `agent_execution_result`、旧 dependency graph 和旧 trace 生产依赖。
- 影响规格范围：删除或失效所有以旧 Agent/AI 运行时为事实来源的 OpenSpec 主规格要求；历史归档和说明文档保留为历史记录。
- 影响测试范围：删除 `tests/agent-orchestrator.test.ts`、旧聊天 AI 流测试、旧 Agent registry / readonly tools 测试、manual LLM 黑盒测试和旧核心链路 fixture；只保留非 AI 公共领域服务测试。
- 不影响数据库 schema、Prisma 模型和纯公共领域能力本身；但这些模块中任何旧 Agent/AI 包装层都必须删除。
