## 1. 边界确认与旧实现隔离

- [ ] 1.1 确认 `remove-current-agent-core-layer` 已完成或生产路径已不再依赖旧 Agent core。
- [ ] 1.2 扫描 `/api/chat`、聊天服务、stream response 和服务端 AI 入口，列出旧 `runAgentOrchestrator()`、旧 `AgentExecutionResult`、旧 response writer、旧 readonly loop 和旧 intent-first 导入点。
- [ ] 1.3 标记可复用底层服务，包括动作检索、conversation artifact、policy/confirmation、user memory、trace storage 和权限隔离服务。
- [ ] 1.4 建立旧实现隔离规则：新 core 不导入 `lib/server/agent-orchestrator/**`，旧 open changes 与新设计冲突时按本 change 执行。

## 2. Agent core 合同与注册系统

- [ ] 2.1 新建 `lib/server/agent-core/**` 模块，定义 `Tool`、`ToolContext`、`ToolResult`、`AgentAction`、`AgentRunResult`、`AgentResourceRef`、`ResourceRole` 和 `Observation` 核心类型。
- [ ] 2.2 实现 `defineTool()`，要求 tool bundle 声明 manifest、input/output schema、resource contract、policy metadata、handler、trace projection 和 response adapter。
- [ ] 2.3 实现 `ToolRegistry`，支持注册、重复检测、权限可用性筛选、按名称读取和安全 manifest 序列化。
- [ ] 2.4 实现 manifest serializer，确保 Planner 只看到安全字段，不暴露 handler、数据库对象、完整 payload 或用户敏感数据。
- [ ] 2.5 为 `defineTool()`、registry、manifest serializer 增加单元测试。

## 3. Planner、Runtime、资源合同与 Policy

- [ ] 3.1 定义 Planner structured output schema，覆盖 `tool_call`、`final_answer`、`ask_user` 和 `request_confirmation`。
- [ ] 3.2 实现 Action Validator，校验 toolName、input schema、terminal action 和 consumes resource refs。
- [ ] 3.3 实现通用 runtime loop，支持多轮 tool call、observation、`maxSteps`、overall timeout、per-tool timeout 和重复失败熔断。
- [ ] 3.4 实现 input/output schema 校验和 resource contract validator，区分 `consumable` 与 `diagnostic` 资源角色。
- [ ] 3.5 实现 Policy Guard，覆盖权限、risk level、side effect、confirmation state 和 confirmation action hash。
- [ ] 3.6 增加 runtime、resource contract、policy、confirmation 和非法 action 的单元测试。

## 4. 三类基础 Tool 闭环

- [ ] 4.1 实现动作候选检索 tool，复用底层动作检索服务，返回 `exercise_candidate_set` consumable resource 和诊断摘要。
- [ ] 4.2 实现读取 conversation artifact payload tool，校验 user/session 权限并返回 artifact payload consumable resource。
- [ ] 4.3 实现保存 conversation artifact tool，经过 Policy Guard 后保存 artifact 或 revision，并返回 persisted artifact consumable resource。
- [ ] 4.4 为三类基础 tool 注册 response adapter 和 trace projection，确保通用 Response Adapter 不写 toolName 分支。
- [ ] 4.5 建立 `lib/server/agent-tools/index.ts` 或等价注册入口，只通过 registry 注册基础 tools。
- [ ] 4.6 为三类基础 tools 增加 tool contract、resource role、policy 和 response adapter 测试。

## 5. Response Adapter、Trace Replay 与 `/api/chat` 接入

- [ ] 5.1 实现通用 Response Adapter，从 terminal action、tool results 和 tool response adapters 生成 `content`、artifact、assistant suggestions、confirmation、error 和 `done` NDJSON 事件。
- [ ] 5.2 实现 Agent run trace，记录 context 摘要、manifest 摘要、planner action、policy decision、tool input/output 摘要、resource refs、terminal action 和 response events。
- [ ] 5.3 实现 replay fixture，使测试可以在不调用真实模型的情况下重放 planner actions、tool loop、resource validation、policy 和 response adapter。
- [ ] 5.4 调整聊天服务和 `/api/chat`，接入新 Agent runtime、Response Adapter、NDJSON stream 和 trace id 输出。
- [ ] 5.5 确保 `/api/chat` 新链路失败时返回结构化可恢复错误，不回退旧 Agent core、旧 intent-first 或旧 readonly loop。
- [ ] 5.6 增加 `/api/chat` NDJSON 集成测试，覆盖动作推荐、读取 artifact、保存 artifact 和结构化错误收口。

## 6. 只注册 Tool 即可扩展的验收

- [ ] 6.1 新增测试用扩展 tool bundle，并只通过 registry 注册。
- [ ] 6.2 测试证明扩展 tool 出现在 Planner manifest、可被 runtime 执行、可通过 resource contract 校验、可由 response adapter 输出 NDJSON。
- [ ] 6.3 增加架构扫描，证明扩展 tool 不需要修改 orchestrator runtime、planner loop、executor、policy guard、resource validator、Response Adapter 主流程或 `/api/chat` 接入层。
- [ ] 6.4 增加架构扫描，证明生产路径不导入旧 `runAgentOrchestrator()`、旧 `AgentExecutionResult`、旧 response writer、旧 intent-first 或旧 readonly loop。
- [ ] 6.5 扫描新 core 代码，禁止出现按具体 toolName 编写业务分支的 orchestrator 主流程逻辑。

## 7. 文档与验证

- [ ] 7.1 运行 `openspec validate build-agent-tool-orchestrator-phase-one-loop --strict`。
- [ ] 7.2 运行 `npm run typecheck`。
- [ ] 7.3 运行相关自动化测试，至少覆盖 agent-core、agent-tools、chat service、resource contract、policy、response adapter 和 replay fixture。
- [ ] 7.4 运行 `npm run build`，验证 `/api/chat`、服务端模块边界和 Next.js 构建。
- [ ] 7.5 按实际架构调整结果，在 `docs/方案变更历史/` 新增本次变更记录。
- [ ] 7.6 按实际架构调整结果，在 `docs/项目演变历程.md` 末尾追加简要演进记录。
- [ ] 7.7 不主动启动 dev server；如实现阶段确需浏览器验证，先说明原因并等待确认，只复用已启动的 `http://localhost:3000`。
