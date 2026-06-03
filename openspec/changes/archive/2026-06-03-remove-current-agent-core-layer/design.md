## Context

当前 `/api/chat` 主链、旧 `AgentOrchestrator`、tool registry、Prompt、模型调用、Response Writer、AI trace、manual LLM 黑盒 runner 和核心链路测试已经形成一套互相依赖的旧 AI/Agent 运行时。它不仅包含通用编排层，还混入训练生成、artifact 投影、资源恢复、旧事件兼容和调试报告字段。

本 change 的目标不是把旧 core 抽象成新 core，也不是保留接口等待新实现替换，而是删除运行时代码中的旧 AI/Agent 系统。项目仍保留页面壳、历史文档和纯公共领域能力；除文档外，旧 AI/Agent 流程相关资产不继续保留。

## Goals

- 删除所有运行时 AI/Agent 执行逻辑，包括旧 Agent core、旧 tools、旧 Prompt、模型调用、Response Writer、AI trace 生产、旧活动状态、旧 stream 事件和旧业务恢复逻辑。
- 删除 `/api/chat` 的 AI 执行能力，使其不再触发模型调用、tool calling、summary 更新、artifact 生成或旧 Agent NDJSON 事件。
- 保留现有页面和组件壳，但断开页面到旧 AI 接口、旧 Agent stream、旧 trace 生产和旧核心链路函数的依赖。
- 保留历史文档和 OpenSpec 历史记录；文档只作为项目演进记录，不作为运行时兼容要求。
- 只保留真正公共、非 AI、无旧 Agent 业务逻辑的领域模块。模块只要包含旧 AI/Agent 业务包装、执行合同、tool 语义或投影逻辑，就删除或先拆出纯公共能力后删除耦合部分。
- 删除旧核心链路测试、manual LLM 黑盒测试、fixture 和旧内部字段断言。
- 建立架构级缺席验证，证明生产代码不再包含旧 AI/Agent 运行时入口、合同、事件和模型调用。

## Non-Goals

- 本 change 不实现新的 Agent core。
- 本 change 不保留旧 AI 接口的兼容响应、fallback、legacy adapter 或假执行结果。
- 本 change 不把旧黑盒测试迁移成新验收测试；旧核心链路测试直接删除。
- 本 change 不处理其他 open changes 的去留。其他 change 是否继续、删除或重写由人工另行决定。
- 本 change 不删除历史文档，也不要求清理 archived OpenSpec 记录中的历史描述。
- 本 change 不改变 Prisma schema、数据库表结构或纯公共领域数据模型。

## Decisions

### 1. 删除运行时 AI/Agent 系统，而不是只删 Agent core

实现阶段 SHALL 删除旧 `lib/server/agent-orchestrator/**`，同时删除所有依赖该 core 的运行时 AI 外围：Prompt / 模型调用协议、token budget 中旧 Agent 输入、Response Writer、AI trace 生产、activity mapper、旧 NDJSON Agent 事件、manual LLM runner 和旧核心链路测试。生产代码 SHALL NOT 再导入或调用 `runAgentOrchestrator()`、`AgentExecutionResult`、`AgentToolRegistry`、旧 Agent tools、旧 `projectAgentExecutionResultToResponse()` 或旧模型决策 provider。

### 2. `/api/chat` 不再承载 AI 执行能力

`/api/chat` 的旧 AI 执行能力 SHALL 被删除。实现可以选择删除 route、让 route 返回普通非 AI 不可用错误，或仅保留非 AI 请求校验边界；但 MUST NOT 保留模型调用、tool calling、summary 更新、artifact 生成、旧 `agent_execution_result`、旧 dependency graph、旧 `legacyPathSkip`、旧 response projection 或旧 AI trace 生产。

### 3. 页面壳保留，调用链断开

聊天页面、dev trace 页面和相关组件 MAY 保留视觉结构、布局、静态状态和历史展示入口。页面层 MUST NOT 继续依赖旧 AI 执行函数、旧 Agent stream 解析、旧核心链路事件或旧模型调用结果。需要展示不可用状态时，应使用非 AI 的本地 UI 状态，不伪造旧 Agent 事件。

### 4. 只保留公共非 AI 模块

动作库查询、训练校验、artifact 持久化、policy/confirmation、user memory、数据库访问等模块只有在它们作为公共领域能力且不依赖旧 AI/Agent 时才可保留。若某个模块同时包含公共能力和旧 Agent 业务逻辑，必须拆出公共能力后删除旧 AI/Agent 部分；若拆分成本高或边界不清，优先删除整个非公共模块。

### 5. 文档保留，运行时资产不保留

`docs/**`、OpenSpec archive、本 change 文档和方案历史作为历史记录保留。测试、fixture、manual LLM runner、trace replay、Prompt 模板、旧工具定义和旧事件 schema 不属于文档资产，若服务旧核心链路则必须删除。

### 6. 不做兼容层

实现阶段 MUST NOT 为旧 UI、旧测试、旧 trace 或旧 open changes 保留兼容 adapter。不得返回伪造的 `AgentExecutionResult`、伪造 tool result、伪造 dependency graph、伪造 legacy skip，也不得把旧 AI 错误包装成看似仍可恢复的 Agent 结果。

### 7. 其他 open changes 暂不参与本 change 决策

其他仍引用旧 Agent core 的 open changes 不作为本 change 的阻塞条件。实现本 change 时不需要同时修正这些 change；它们后续继续、删除或重写由人工单独决定。

## Boundary Map

| 分类 | 处理方式 | 说明 |
| --- | --- | --- |
| `lib/server/agent-orchestrator/**` | Delete | 删除旧 runtime、contracts、context builder、tool registry、readonly/workout tools、response writer、resource recovery 和 trace projection。 |
| 服务端 AI 执行逻辑 | Delete | 删除旧 Prompt / 模型调用协议、Agent decision provider、旧 token budget 输入、summary 更新中的旧 Agent action summary、AI response projection。 |
| `/api/chat` AI 能力 | Delete | 删除 AI 生成、tool calling、artifact 生成、旧 Agent NDJSON 事件、旧 trace final decision 和旧可恢复 Agent 错误。 |
| 旧 Agent tests / LLM tests | Delete | 删除核心链路测试、registry 测试、manual LLM runner、黑盒断言和旧 fixture，不迁移成兼容测试。 |
| 页面和组件壳 | Keep UI Shell | 保留页面结构、布局和非 AI 本地状态；断开旧 AI 调用、stream 解析和旧 Agent 事件依赖。 |
| 历史文档 | Keep Docs Only | 保留 `docs/**`、OpenSpec archive、方案历史和本 change 文档；历史文本不形成运行时要求。 |
| 公共领域服务 | Keep Only If Non-AI | 仅保留不依赖旧 AI/Agent 的动作库、训练校验、artifact 持久化、policy/confirmation、user memory、数据库访问。 |
| 混合模块 | Delete or Extract | 只要包含旧 AI/Agent 业务包装、旧 tool 语义、旧执行合同或旧投影，必须删除或先抽出纯公共能力。 |
| 其他 open changes | Ignore For This Change | 不作为当前实现阻塞；人工后续决定继续、删除或重写。 |

## Migration Plan

1. 扫描运行时代码中的 AI/Agent 入口和合同，包括 `runAgentOrchestrator`、`AgentExecutionResult`、`AgentToolRegistry`、`agent_execution_result`、`agent_tool_decision`、`agent_response_writer`、模型 provider、Prompt module 和 manual LLM runner。
2. 删除旧 `lib/server/agent-orchestrator/**` 和所有旧 Agent tools / registry / response writer / runtime contracts。
3. 删除或断开服务端 AI 执行外围，包括 `/api/chat` AI 执行能力、旧模型调用、旧 Prompt、旧 trace 生产、旧 summary action 输入和旧 Agent stream metadata。
4. 保留页面壳并移除页面对旧 AI 接口、旧 stream 事件和旧 trace 运行时字段的强依赖。
5. 删除旧核心链路测试、manual LLM 黑盒测试、fixture 和旧内部字段断言。
6. 审核公共领域模块，删除任何仍包含旧 AI/Agent 业务逻辑的非公共代码。
7. 增加或更新架构扫描，证明生产代码没有旧 AI/Agent 运行时引用。
8. 运行 OpenSpec、typecheck、相关自动化测试和必要构建检查。

## Risks

- 页面保留但 AI 能力删除后，用户可见聊天生成会不可用：这是本 change 的预期结果。
- 公共领域服务和旧 Agent 包装混在一起时可能误保留旧业务逻辑：通过 Delete or Extract 边界和架构扫描控制。
- 其他 open changes 仍引用旧路径：本 change 不处理它们，后续由人工决定。
- 旧 trace/debug 页面若依赖旧运行时字段，可能需要降级为历史页面或静态壳：不得为它恢复旧 trace 生产。

## Validation

- `openspec validate remove-current-agent-core-layer --strict`
- `npm run typecheck`
- 相关自动化测试，至少覆盖公共领域服务仍可独立导入，以及架构扫描确认生产代码没有旧 AI/Agent 运行时引用。
- 如删除影响构建、路由或模块边界，应运行 `npm run build` 或说明无法运行原因。
- 不需要浏览器验证；本 change 不涉及视觉还原，页面壳保留可通过类型检查和构建验证。
