## 1. 边界确认与生产无业务聊天语义

- [ ] 1.1 以 `remove-current-agent-core-layer` 已完成为前置事实；本 change 不再做旧 core 扫描、旧路径兼容或旧事件适配。
- [ ] 1.2 标记所有具体业务服务为本 change 的非目标范围；新 core 不得直接导入具体业务服务。
- [ ] 1.3 定义生产 `/api/chat` 在没有业务 tool 时的语义：仍调用 LLM 正常聊天，可输出 `final_answer` 或 `ask_user`，但不得输出训练卡片、artifact、保存结果或功能执行事件。
- [ ] 1.4 建立 fixture tool 边界：无业务 fixture tools 只能通过测试、replay 或显式 test harness 注入，不得注册进生产 `/api/chat` 默认 registry。
- [ ] 1.5 建立 15 项完整闭环验收清单，并在测试中逐项覆盖 `docs/agent-tool-orchestrator-design.md` 第 18 节列出的所有通用能力。

## 2. Agent core 合同与注册系统

- [ ] 2.1 新建 `lib/server/agent-core/**` 模块，定义 `Tool`、`ToolContext`、`ToolResult`、`AgentAction`、`AgentRunInput`、`ContextPackage`、`AgentRunResult`、`AgentResourceRef`、`ResourceRole` 和 `Observation` 核心类型。
- [ ] 2.2 实现 `defineTool()`，要求 tool bundle 声明 manifest、input/output schema、resource contract、policy metadata、handler、trace projection 和 response adapter。
- [ ] 2.3 实现 `ToolRegistry`，支持注册、重复检测、权限可用性筛选、按名称读取和安全 manifest 序列化。
- [ ] 2.4 实现 manifest serializer，确保 Planner 只看到安全字段，不暴露 handler、数据库对象、完整 payload 或用户敏感数据。
- [ ] 2.5 固定新 runtime 导出命名，例如 `runAgentToolOrchestrator`，不得复用旧 `runAgentOrchestrator` 名称。
- [ ] 2.6 为 `defineTool()`、registry、manifest serializer、生产 registry 不含 fixture tools 增加单元测试。

## 3. Planner、Runtime、资源合同与 Policy

- [ ] 3.1 定义 Planner Provider，覆盖真实模型调用入口、replay planner、structured output schema、repair feedback、usage 记录和 trace 摘要。
- [ ] 3.2 定义 Planner structured output schema，覆盖 `tool_call`、`final_answer`、`ask_user` 和确认请求 draft。
- [ ] 3.3 实现 Action Validator，校验 toolName、input schema、terminal action、无需 tool 的 `final_answer` / `ask_user` 和 consumes resource refs。
- [ ] 3.4 实现通用 runtime loop，支持多轮 tool call、observation、`maxSteps`、overall timeout、per-tool timeout 和重复失败熔断。
- [ ] 3.5 实现 input/output schema 校验和 resource contract validator，区分 `consumable` 与 `diagnostic` 资源角色。
- [ ] 3.6 实现 Policy Guard，覆盖权限、risk level、side effect、confirmation state 和 confirmation action hash；真实 hash 只能由服务端生成，Planner 输出的 hash 不得被信任。
- [ ] 3.7 增加 runtime、planner provider、resource contract、policy、confirmation 和非法 action 的单元测试。
- [ ] 3.8 增加端到端 replay 测试，覆盖 Planner 连续多轮 tool call、资源消费、无需 tool 的普通聊天 terminal action、Response Adapter 投影和结构化错误收口。

## 4. 无业务 Fixture Tool 闭环

- [ ] 4.1 实现只读 fixture tool，验证 manifest、input/output schema、handler、trace projection 和 response adapter。
- [ ] 4.2 实现 resource producer fixture tool，返回 consumable resource 和 fulfillment evidence。
- [ ] 4.3 实现 resource consumer fixture tool，验证 `consumes` 引用、resourceContract 校验和跨 tool 资源消费。
- [ ] 4.4 实现 confirmation write fixture tool，验证 Policy Guard、confirmation action hash 和未确认时 handler 不执行。
- [ ] 4.5 实现 diagnostic failure fixture tool，验证 diagnostic resource 不能被当作成功资源消费。
- [ ] 4.6 通过 replay fixture 或显式 test harness 跑通所有 fixture tools 的完整闭环，覆盖成功、diagnostic、权限失败、schema 失败、resource contract 失败和 confirmation。
- [ ] 4.7 确保 fixture tools 只存在于测试、replay 或显式 test harness，不提前实现任何具体业务 tool，也不进入生产 `/api/chat` 默认 registry。

## 5. Response Adapter、Trace Replay 与 `/api/chat` 接入

- [ ] 5.1 实现通用 Response Adapter，从 terminal action、tool results 和 tool response adapters 生成 `content`、`tool_result`、`assistant_suggestions`、`confirmation_request`、`error` 和 `done` NDJSON 事件，并对所有 adapter 输出做 `AgentStreamEvent` schema、resource provenance 和 resource role 校验。
- [ ] 5.2 实现 Agent run trace，记录 context 摘要、manifest 摘要、planner action、policy decision、tool input/output 摘要、resource refs、terminal action、response events、usage 和基础长度裁剪信息。
- [ ] 5.3 实现 replay fixture，使测试可以在不调用真实模型的情况下重放 planner actions、tool loop、resource validation、policy 和 response adapter。
- [ ] 5.4 调整聊天服务和 `/api/chat`，接入新 Agent runtime、Response Adapter、NDJSON stream 和 trace id 输出。
- [ ] 5.5 确保 `/api/chat` 新链路失败时返回结构化可恢复错误，不回退旧 Agent core、旧 intent-first 或旧 readonly loop。
- [ ] 5.6 增加 `/api/chat` NDJSON 集成测试，覆盖生产 registry 无业务 tool 时的普通聊天、`ask_user`、trace id、结构化错误收口和 `done` 事件。
- [ ] 5.7 增加 test harness 或 replay 集成测试，使用无业务 fixture tools 覆盖 tool call、resource consumption、confirmation、trace id、结构化错误收口和 `done` 事件。
- [ ] 5.8 增加真实聊天服务层测试，证明请求可以从 hydration 到新 Agent runtime 再到 NDJSON 输出端到端完成。

## 6. 只注册 Tool 即可扩展的验收

- [ ] 6.1 新增测试用扩展 tool bundle，并只通过 registry 注册。
- [ ] 6.2 测试证明扩展 tool 出现在 Planner manifest、可被 runtime 执行、可通过 resource contract 校验、可由 response adapter 输出 NDJSON。
- [ ] 6.3 增加架构扫描，证明扩展 tool 不需要修改 orchestrator runtime、planner loop、executor、policy guard、resource validator、Response Adapter 主流程或 `/api/chat` 接入层。
- [ ] 6.4 增加架构扫描，证明生产 registry 不包含无业务 fixture tools。
- [ ] 6.5 扫描新 core 代码，禁止出现按具体 toolName 编写业务分支的 orchestrator 主流程逻辑。
- [ ] 6.6 增加反向测试：如果新 tool 需要修改 orchestrator 主流程才能工作，测试必须失败，并要求把缺失能力补入 tool bundle 合同或通用 core 合同。

## 7. 文档与验证

- [ ] 7.1 运行 `openspec validate build-agent-tool-orchestrator-phase-one-loop --strict`。
- [ ] 7.2 运行 `npm run typecheck`。
- [ ] 7.3 运行相关自动化测试，至少覆盖 agent-core、fixture tools、chat service、resource contract、policy、response adapter 和 replay fixture。
- [ ] 7.4 运行 `npm run build`，验证 `/api/chat`、服务端模块边界和 Next.js 构建。
- [ ] 7.5 运行完整闭环验收，逐项证明 15 项通用能力全部完成；任一项缺失不得标记本 change complete。
- [ ] 7.6 按实际架构调整结果，在 `docs/方案变更历史/` 新增本次变更记录。
- [ ] 7.7 按实际架构调整结果，在 `docs/项目演变历程.md` 末尾追加简要演进记录。
- [ ] 7.8 不主动启动 dev server；如实现阶段确需浏览器验证，先说明原因并等待确认，只复用已启动的 `http://localhost:3000`。
