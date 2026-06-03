## Context

`docs/agent-tool-orchestrator-design.md` 已将新架构分成 M0 / M1 / M2。当前 M0 已完成 `Tool Bundle -> ToolRegistry -> manifest -> PlannerPort / ReplayPlanner -> Action Validator -> Executor -> Observation -> Runtime -> Response Renderer` 的只读合同闭环，并刻意拒绝资源引用、写操作、高风险操作和 confirmation-required tool。

M1 的目标不是恢复旧 `lib/server/agent-orchestrator/**`，也不是把新 core 接入 production `/api/chat`，而是在新 `lib/server/agent-core/**` 内补齐安全与资源闭环：资源只通过 `ResourceStore` 传递，写操作只通过 `Policy Guard` 和 confirmation 恢复执行，diagnostic failure 不能被 Planner 包装成成功事实。

## Goals / Non-Goals

**Goals:**

- 在 `agent-core` 中新增 `ResourceStore`、`ToolResourceContract`、Resource Contract Validator 和资源角色校验。
- 扩展 `AgentResourceRef` / `RegisteredResource` / `ToolResult.fulfillment`，让 tool result 可以登记 produced / consumed resource，并保持当前 run 隔离。
- 扩展 Action Validator：`tool_call.consumes`、`final_answer.usedResourceRefs`、`ask_user.usedResourceRefs` 都必须引用当前 run 中已登记且符合角色要求的资源。
- 新增 `Policy Guard`，在 Executor 之前统一处理 permissions、sideEffect、riskLevel、confirmation 策略和动态策略。
- 新增 `ConfirmationStore`、pending action、服务端 action hash 和 confirmation resume，让确认后执行的是服务端保存的 `tool_call`。
- 新增 resource producer / consumer / confirmation write / diagnostic failure / trace-replay fixture，证明新增 tool 不需要修改 runtime、executor、policy、renderer 或 API 主流程。
- 补齐自动化测试和架构扫描，证明 M1 没有业务 toolName 分支、没有用户自然语言关键词分流、没有真实业务 tool 或生产聊天接入。

**Non-Goals:**

- 不接入 production `/api/chat`，不新增真实 `/api/agent/confirm` 生产路由；M1 可提供 core 级 confirmation resume 函数或测试入口。
- 不接入真实 LLM adapter、OpenAI/Anthropic function calling、JSON mode 或模型 prompt。
- 不注册动作库、训练生成、保存、用户记忆等真实业务 tool。
- 不引入 Prisma migration、持久化 pending action 表或跨进程 confirmation 存储；生产级持久化留给接入生产聊天的后续 change。
- 不实现 M2 的 manifestHash / registry snapshot 硬化、redaction 审计、observation 压缩、真实 trace 脱敏审计或 tool manifest linter。
- 不通过服务端关键词、正则、同义词或规则评分改写 Planner 的语义 action。

## Decisions

### 1. `ResourceStore` 是当前 run 内资源事实的唯一来源

M1 SHALL 新增 `resource-store.ts`，提供 `register()`、`get()`、`list()`、`assertConsumable()` 和等价只读查询能力。`RegisteredResource` 至少包含 `type`、`resourceId`、`role`、`runId`、`sourceToolResultId`、`schemaVersion`、`summary`、`expiresAt` 或等价字段。

取舍：让 handler 直接返回 resource id 最省事，但 downstream tool 会无法区分未登记资源、跨 run 资源和 diagnostic 资源。`ResourceStore` 统一登记后，Action Validator、Runtime、Renderer 和 trace fixture 都能基于同一事实判断。

### 2. Resource Contract Validator 校验 produced 与 consumed 两端

`Tool.resourceContract` SHALL 描述 `requires` 与 `produces`。Runtime 在执行前校验 `tool_call.consumes` 是否满足 tool 的 `requires`，在执行后校验 handler 声明或 `ToolResult.fulfillment.producedResources` 是否符合 `produces`。不符合合同时 MUST 生成结构化失败 observation，不得登记为 consumable。

取舍：只在 Action Validator 校验 consumes 不够，因为 handler 仍可能产出未声明类型或把失败结果伪装为资源。执行后再校验 produced 可以阻断这类合同破坏。

### 3. `diagnostic` 资源只支撑解释和失败，不支撑成功 final answer

Action Validator SHALL 允许 `final_answer` / `ask_user` 引用当前 run 的资源，但必须按终止意图分层：成功性 final answer 只能引用 consumable 资源；诊断失败、阻断、追问或错误说明可以引用 diagnostic 资源。M1 不让 diagnostic resource 被包装成“工具成功完成”或“业务结果已生成”。

取舍：完全禁止 terminal action 引用 diagnostic 会导致失败解释缺少证据；完全允许则会重复旧链路把失败结果当成功依据的问题。按 terminal grounding 分层能保留诊断价值，同时保护成功结果。

### 4. `Policy Guard` 是 Executor 前的唯一策略边界

M1 SHALL 新增 `policy-guard.ts`，由 Runtime 在 Executor 前调用。`Policy Guard` 根据 actor permissions、tool policy、sideEffect、riskLevel、confirmation 策略和动态规则返回 `allow`、`deny` 或 `requires_confirmation`。Tool handler 不接收绕过策略的能力，也不能自行生成确认请求。

取舍：把策略放进 handler 会让每个 tool 重复实现并可能绕过确认。放在 Runtime 里写业务分支又会污染 core。`Policy Guard` 作为可注入通用边界，既能保持 core 不知道业务语义，也能在执行前统一裁判。

### 5. confirmation hash 由服务端基于 canonical action 生成

M1 SHALL 新增 `confirmation-store.ts` 或等价模块，保存 `PendingAction`。`actionHash` MUST 基于服务端 canonical JSON 与 server secret 生成，绑定 `runId`、actor、tool name/version、input hash、resource refs、policy version 和 expiresAt。Planner 和客户端都不能提供或覆盖 action hash。

取舍：让 LLM 生成 confirmation action 会把确认边界交给不可信输出。让客户端 resume 时重传 input 也会形成 TOCTOU 风险。保存 pending action 并确认后执行保存的 action，是 M1 必须建立的安全闭环。

### 6. confirmation resume 先做 core 能力，不做生产 API 接入

M1 SHALL 提供 `resumeConfirmedAction()`、`runConfirmedPendingAction()` 或等价 core 入口，用于校验 `pendingActionId`、`actionHash`、actor、run/conversation、expiresAt、status 后执行保存的 `tool_call`。测试 fixture 验证 consumed 后不可重复执行。生产 `/api/agent/confirm` 路由留给后续接入 production chat 的 change。

取舍：M1 如果直接新增生产 route，会被迫处理认证、stream 协议、持久化存储、跨请求恢复和真实用户体验，范围会滑入 M2/生产接入。core resume 能先证明安全语义，后续 API 只做认证和请求封装。

### 7. M1 fixture tools 覆盖安全闭环，不代表业务能力

新增 fixture producer / consumer / confirmation write / diagnostic failure / trace-replay tool，全部位于 `lib/server/agent-tools/fixture/**`。这些 tool 只验证通用合同：producer 产出 consumable resource，consumer 只能消费已登记 resource，write fixture 必须 confirmation，diagnostic failure 只能作为诊断证据。

取舍：用真实动作库或训练计划 tool 验收会把业务字段、数据库权限和模型行为混进 core 安全验证。fixture 可以稳定证明 M1 机制，真实业务 tool 后续只按合同注册。

### 8. Trace / Replay fixture 只记录可测试摘要

M1 SHALL 为 replay/trace fixture 记录 policy decision、resource registration、confirmation request/resume 和 terminal grounding 的摘要，以便单元测试复现安全链路。完整脱敏审计、manifestHash、registry snapshot 和生产 trace schema 留给 M2。

取舍：M1 架构文档要求 Trace / Replay fixture，但不要求上线级 trace 系统。先记录测试可断言的结构摘要，可以避免把 M2 的红线审计提前塞进 M1。

## Risks / Trade-offs

- [Risk] `ResourceStore` 与 M0 现有 `AgentResourceRef` 字段不兼容。→ Mitigation：M1 先扩展现有类型并补迁移式测试，确保 M0 无资源引用路径仍保持通过。
- [Risk] confirmation store 只有内存实现，被误解为生产持久化能力。→ Mitigation：模块命名和文档明确 M1 不接入生产 route；tasks 要求架构扫描或测试证明没有生产聊天接入。
- [Risk] diagnostic 资源 grounding 规则过宽，成功 final answer 仍可能引用失败结果。→ Mitigation：在 Action Validator 增加专门测试，覆盖 diagnostic resource 被 final answer 成功引用时必须拒绝。
- [Risk] Policy Guard 动态策略变成业务语义分流。→ Mitigation：M1 只允许基于 actor、tool policy、权限、资源和结构化 input 做确定性判断，不读取用户自然语言关键词。
- [Risk] M1 fixture trace 与后续 M2 trace contract 不一致。→ Mitigation：M1 只承诺 replay/trace fixture 的测试摘要，M2 再统一生产 trace schema、redaction 和 manifestHash。

## Migration Plan

1. 扩展 `contracts.ts`、`errors.ts` 和导出入口，加入 M1 资源、策略、确认和 stream event 类型。
2. 新增 `resource-store.ts`、`resource-contract.ts`、`policy-guard.ts`、`confirmation-store.ts` 和必要的 id/hash 工具。
3. 扩展 Action Validator、Executor、Runtime、Observation、Response Renderer，使资源校验、Policy Guard 和 confirmation request/resume 进入通用主循环。
4. 新增 M1 fixture tools 与 registry 测试入口，补单元测试和端到端 replay 测试。
5. 更新必要文档与方案变更记录，运行 OpenSpec 校验、相关自动化测试和 typecheck。
6. 回滚策略：M1 不改生产路由、不改数据库；如实现失败，删除新增 M1 core 模块、fixture 和测试即可回到 M0 只读闭环。

## Open Questions

无。生产 `/api/chat` 接入、真实 `/api/agent/confirm`、持久化 pending action、真实 LLM adapter、真实业务 tool 和完整 Trace/Replay 脱敏审计均明确留给后续 M2 或生产接入 change。
