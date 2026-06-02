## Context

当前 `/api/chat` 主链已经切到 Tool-first `AgentOrchestrator`，但这套实现没有形成真正通用的 Agent core。旧 `runtime`、tool registry、tool 外壳、资源恢复、训练 artifact 投影、Response Writer 和具体 tool name 已经互相绑定，导致编排器承担了过多训练业务细节。

继续在这套核心层上抽象，会让旧合同、新合同、兼容逻辑和业务补丁同时存在。项目当前没有生产用户负担，本 change 选择 delete-only：删除当前 Agent 核心层，后续按新的 `docs/agent-tool-orchestrator-design.md` 方向重新建立干净的 core。

## Goals

- 删除当前 Agent 核心层，不把旧 `AgentOrchestrator` 继续作为 `/api/chat` 的执行基础。
- 删除当前 Agent tools 和旧 tool registry，而不是保留旧 tool 外壳继续改造。
- 删除旧 `AgentExecutionResult`、旧 final result 投影、旧 resource recovery 和旧 response writer 绑定。
- 保留底层领域服务，包括动作检索、训练校验、artifact 持久化、policy/confirmation、user memory、数据库访问和 trace 经验。
- 让 `/api/chat` 保留认证、请求校验、hydration、NDJSON 协议和 trace 入口，但不得调用旧 Agent core。
- 为后续新 Agent core 提供干净边界：新 core 必须重新定义 `defineTool`、Tool manifest、tool registry、Planner、Policy Guard、Response Adapter 和 resource contract。

## Non-Goals

- 本 change 不实现新的 Agent core。
- 本 change 不重写所有新 Agent tools。
- 本 change 不改变 Prisma schema、数据库表结构或已有领域服务的数据模型。
- 本 change 不重建黑盒 LLM 测试，只保留可复用语料和验收经验。
- 本 change 不通过服务端自然语言规则临时接管旧 Agent 的语义决策。

## Decisions

### 1. 删除旧核心层，而不是兼容旧核心层

实现阶段 SHALL 删除 `lib/server/agent-orchestrator/**` 中作为当前 Agent core 的 runtime、contracts、context builder、tool registry、readonly/workout tools、response writer、trace projection 和相关测试夹具。生产 `/api/chat` SHALL NOT 再导入或调用 `runAgentOrchestrator()`、`AgentExecutionResult`、旧 `projectAgentExecutionResultToResponse()` 或旧 Agent tool modules。

### 2. 保留领域服务，删除 Agent 包装层

动作库检索、训练校验、artifact 保存、policy/confirmation、user memory 和 trace storage 是可复用基础，不属于删除目标。删除的是这些服务上方绑定旧 Agent core 的包装层和投影层。

### 3. `/api/chat` 保留协议边界，但不得接旧 core

如果新 Agent core 尚未接入，`/api/chat` 可以返回明确的可恢复服务不可用结果，或由后续 change 接入新 core；但实现阶段 MUST NOT 通过旧 Agent core、旧 intent-first 路径、standalone readonly loop 或旧 trigger parser 继续支撑业务。

### 4. 旧规格同步失效

`tool-first-agent-orchestrator`、`agent-runtime-resource-contract`、`agent-tool-capability-contract` 中绑定旧 runtime、旧 tool name、旧 final result、旧资源恢复和旧投影行为的 requirement SHALL 被移除。后续新 core 的规格必须重新以通用编排器和单一职责 tool 为边界定义。

### 5. 测试从旧行为断言转为缺席断言

旧测试中断言具体 tool name、`generated/patched` 收口、`agent_execution_result` 事件字段、旧 resource id 或旧 dependency graph 的用例 SHALL 删除或改成“旧核心层不可被生产路径导入”的架构级扫描。黑盒 LLM 场景只作为后续新 core 的验收语料保留。

## Boundary Map

### Delete

- 当前 Agent core runtime、contracts、execution state、execution result 和 planner loop。
- 当前 Agent tool registry、tool manifest 序列化、readonly/workout tool 外壳和旧 capability contract 适配。
- 当前 Agent response writer、activity event mapper、final result projection 和旧 resource recovery。
- 依赖旧 Agent core 的测试夹具、trace fixture 和黑盒断言。

### Keep

- `/api/chat` route 的认证、请求 schema、streaming NDJSON 响应格式和 trace id 输出边界。
- chat hydration、conversation message 读取和服务端 user/session 权限隔离。
- conversation artifact service、artifact revision persistence、workout validation、exercise search、policy/confirmation、user memory。
- 黑盒测试场景文本、trace 存储经验和资源角色经验，作为后续新 core 的输入。

### Rebuild Later

- `defineTool`、ToolRegistry、tool manifest、input/output schema 校验、resource contract 校验。
- Planner 输出 `AgentAction`、多轮 tool call、step limit、timeout、防循环和 policy guard。
- 通用 Response Adapter、trace replay fixture 和新 `/api/chat` core 接入。
- 单一职责的新 Agent tools。

## Migration Plan

1. 合并本 change，先固定删除边界和旧规格失效范围。
2. 删除旧 Agent core 文件和旧 Agent tools。
3. 调整 `/api/chat`，使其不再导入旧 core；新 core 尚未接入时返回明确服务不可用结果。
4. 删除或重写旧 Agent core 测试，增加旧核心层缺席扫描。
5. 运行 OpenSpec、typecheck 和相关测试，确认生产路径没有旧 core 导入。
6. 后续另起 change 按新设计重新实现 Agent core 和单一职责 tools。

## Risks

- 删除后聊天 AI 业务会暂时不可用：这是预期取舍，避免旧核心层继续污染新设计。
- 误删领域服务：通过保留边界和架构扫描控制，领域服务不作为删除目标。
- 旧 specs 与新边界冲突：本 change 同步移除旧 runtime/tool capability 要求。
- 后续新 core 需求被旧测试误导：旧行为测试必须删除或转为缺席断言，黑盒文本只作为用户场景语料。

## Validation

- `openspec validate remove-current-agent-core-layer --strict`
- `npm run typecheck`
- 相关自动化测试，至少覆盖 `/api/chat` 不导入旧 Agent core、旧 tool modules 不在生产路径出现、保留的领域服务仍可被测试导入。
- 不需要浏览器验证；本 change 不涉及 UI 视觉或真实浏览器交互。
