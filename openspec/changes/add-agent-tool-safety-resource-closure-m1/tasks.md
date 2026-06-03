## 1. M1 合同类型与错误码

- [ ] 1.1 扩展 `lib/server/agent-core/contracts.ts`，定义 `ResourceRole`、`RegisteredResource`、`ToolResourceContract`、resource requires/produces、`PolicyDecision`、`PendingAction`、confirmation resume input 和 M1 stream event 类型。
- [ ] 1.2 调整 `AgentResourceRef`，使 resource ref 能表达 resource type/id、role、version 或等价字段，并保持 M0 无资源引用路径兼容。
- [ ] 1.3 扩展 `ToolPolicy`，支持 permissions、`confirmation: "never" | "always" | "dynamic"` 或等价 M1 策略语义，并兼容 M0 已有 read fixture。
- [ ] 1.4 扩展 `ToolResult.fulfillment`，记录 `satisfied`、`producedResources`、`consumedResources`、`unmetRequirements` 或等价资源履约摘要。
- [ ] 1.5 扩展 `AGENT_ERROR_CODES`，覆盖 resource missing、resource role invalid、resource contract violation、policy denied、confirmation required、confirmation expired、confirmation consumed、confirmation hash invalid 等稳定错误。
- [ ] 1.6 为新增导出类型、核心对象和工具函数补充简短中文意图注释，说明其在 M1 安全/资源链路中的边界。

## 2. ResourceStore 与 Resource Contract Validator

- [ ] 2.1 新增 `lib/server/agent-core/resource-store.ts`，实现当前 run 内 `register()`、`get()`、`list()`、`assertConsumable()` 和只读 inventory 查询。
- [ ] 2.2 保证 `ResourceStore` 登记资源时绑定当前 `runId`、`sourceToolResultId`、resource role、schemaVersion 和安全 summary。
- [ ] 2.3 新增 `lib/server/agent-core/resource-contract.ts`，实现 tool 执行前 requires 校验和执行后 produces 校验。
- [ ] 2.4 校验 downstream tool 只能消费当前 run 内已登记且 role 为 `consumable` 的资源，跨 run、未登记和 `diagnostic` 资源必须被拒绝。
- [ ] 2.5 校验 produced resource 的 type / role 必须符合 tool 的 `resourceContract.produces`，不符合时不得登记为 consumable。
- [ ] 2.6 将 `ResourceStore` 注入 tool handler context，使 handler 能通过受控接口读取已校验资源，但不能绕过 store 任意伪造可消费资源。

## 3. Policy Guard 与 Confirmation Store

- [ ] 3.1 新增 `lib/server/agent-core/policy-guard.ts`，实现 allow / deny / requires_confirmation 三类通用策略裁决。
- [ ] 3.2 `Policy Guard` 必须在 Executor 前校验 actor permissions、tool policy、sideEffect、riskLevel、confirmation 策略、resource refs 和结构化 input。
- [ ] 3.3 保证 `Policy Guard` 不读取用户自然语言关键词、正则、同义词表或模板来做业务语义分流。
- [ ] 3.4 新增 `lib/server/agent-core/confirmation-store.ts` 或等价模块，定义 `ConfirmationStore` 接口和测试用内存实现。
- [ ] 3.5 实现 pending action 创建、状态流转、expiresAt 校验、consumed 标记和重复 resume 拒绝。
- [ ] 3.6 实现服务端 action hash，基于 canonical JSON 绑定 runId、actor、toolName、toolVersion、input hash、resource refs、policy version 和 expiresAt 或等价字段。
- [ ] 3.7 实现 confirmation resume core 入口，确认后执行服务端保存的 pending `tool_call`，不得信任客户端或 LLM 重传的新 input。

## 4. Runtime、Validator、Executor 与 Renderer 集成

- [ ] 4.1 扩展 Action Validator，允许合法 `tool_call.consumes`，并基于 `ResourceStore` 与 Resource Contract 校验资源存在性、run 归属、角色和类型。
- [ ] 4.2 扩展 terminal action 校验，允许 `final_answer` 引用当前 run consumable resource，拒绝成功回答引用 diagnostic resource。
- [ ] 4.3 允许 `ask_user` 或等价非成功收口引用 diagnostic resource 作为澄清、阻断或失败证据，并确保 renderer 不把它投影为成功业务结果。
- [ ] 4.4 调整 Runtime loop，在 `tool_call` 校验通过后、Executor 执行前调用 `Policy Guard`。
- [ ] 4.5 Runtime 遇到 `requires_confirmation` 时必须保存 pending action 并返回 confirmation result，不得调用 tool handler。
- [ ] 4.6 Executor 执行成功后必须进行 output schema 与 produced resource contract 校验，再登记资源并生成 observation。
- [ ] 4.7 Observation 只使用 resource ref、安全 summary、projection.model 或默认安全摘要，不把完整 output、secret 或内部对象传给 Planner。
- [ ] 4.8 Response Renderer 支持 confirmation request 白名单事件或等价安全响应，并继续禁止完整 tool output 默认进入用户事件。
- [ ] 4.9 更新 `lib/server/agent-core/index.ts` 导出 M1 新模块，保持外部只通过 core 合同使用资源、策略和确认能力。

## 5. M1 Fixture Tools 与注册入口

- [ ] 5.1 新增 resource producer fixture tool，声明 `resourceContract.produces` 并产出当前 run 的 `consumable` resource。
- [ ] 5.2 新增 resource consumer fixture tool，声明 `resourceContract.requires`，只能消费当前 run 已登记的 `consumable` resource。
- [ ] 5.3 新增 confirmation write fixture tool，声明 write / high risk 或 confirmation-required policy，handler 只能在 confirmation resume 后执行。
- [ ] 5.4 新增 diagnostic failure fixture tool，产出失败或未满足结果，并登记或暴露 diagnostic evidence。
- [ ] 5.5 新增 trace / replay fixture 或等价测试摘要，记录 resource registration、policy decision、confirmation request/resume、tool result 和 terminal grounding。
- [ ] 5.6 更新 `lib/server/agent-tools/index.ts` 或测试注册入口，只通过 ToolRegistry 注册 M1 fixture tools，不修改 Runtime、Executor、Policy Guard、Resource Contract Validator 或 Renderer 主流程。

## 6. 自动化测试

- [ ] 6.1 新增 ResourceStore 单元测试，覆盖登记、查询、当前 run 隔离、未登记 resource、跨 run resource 和 diagnostic 不可消费。
- [ ] 6.2 新增 Resource Contract Validator 测试，覆盖 requires 缺失、type/role 不匹配、producer 产出未声明资源和成功资源链路。
- [ ] 6.3 扩展 Action Validator 测试，覆盖合法 consumes、非法 diagnostic consumes、final answer 引用 diagnostic 被拒绝、ask_user 引用 diagnostic 被接受。
- [ ] 6.4 新增 Policy Guard 测试，覆盖低风险只读允许、权限不足拒绝、write/high risk/confirmation-required 进入 requires_confirmation。
- [ ] 6.5 新增 ConfirmationStore / resume 测试，覆盖 hash 绑定、hash 失效、过期、consumed 后重复提交、客户端重传 input 被忽略或拒绝。
- [ ] 6.6 新增 Runtime 端到端测试，覆盖 producer -> consumer -> final answer 的 consumable resource 链路。
- [ ] 6.7 新增 Runtime 端到端测试，覆盖 confirmation write fixture 先返回 confirmation request，resume 后才执行保存 action。
- [ ] 6.8 新增 diagnostic failure 端到端测试，证明 diagnostic resource 不能支撑成功 final answer，但可以支撑 ask_user / failed / blocked 类解释。
- [ ] 6.9 新增 Response Renderer 测试，覆盖 confirmation request event、resource summary 安全投影和完整 output 不泄漏。
- [ ] 6.10 新增架构扫描测试，确认 `agent-core` 没有具体业务 toolName 分支、没有用户自然语言关键词分流、没有导入旧 `lib/server/agent-orchestrator/**`。
- [ ] 6.11 新增架构扫描测试，确认 M1 不接入 production `/api/chat`、不注册真实业务 tool、不接入真实 LLM adapter。

## 7. 文档与项目记录

- [ ] 7.1 更新 `docs/agent-tool-orchestrator-design.md` 的 M1 落地状态，记录 M1 已完成能力、仍保留给 M2 的边界和验证结论。
- [ ] 7.2 在 `docs/方案变更历史` 中新增 M1 安全与资源闭环方案变更记录，时间使用上海时区精确到秒。
- [ ] 7.3 在 `docs/项目演变历程.md` 末尾追加 M1 从 M0 只读内核扩展到资源、策略和确认闭环的简要记录。
- [ ] 7.4 如实现中新增或调整核心目录、入口或运行方式，更新 README 或相关开发文档；若无影响，在实现总结中说明原因。

## 8. 验证与收尾

- [ ] 8.1 运行 `openspec validate add-agent-tool-safety-resource-closure-m1 --strict`。
- [ ] 8.2 运行与实现相关的自动化测试，至少覆盖 `tests/agent-core/**`。
- [ ] 8.3 修改 TypeScript 核心代码后运行 `npm run typecheck`。
- [ ] 8.4 按需运行 `npm test`；如时间或环境限制无法运行，记录未运行原因和剩余风险。
- [ ] 8.5 最终检查 `git diff`，确认只包含 M1 OpenSpec、agent-core、fixture、测试和必要文档改动。
