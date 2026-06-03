# Agent Tool 安全资源闭环 M1

时间：2026-06-03 13:43:49 CST

## 原问题

M0 已经打通了 `ToolRegistry -> PlannerPort -> Action Validator -> Executor -> Observation -> Runtime -> Response Renderer` 的只读合同闭环，但它刻意拒绝资源引用、写操作和 confirmation-required tool。这个边界能证明新 `agent-core` 的最小内核是干净的，但还不足以承载后续真实 Agent tool：下游 tool 无法确定资源是否来自当前 run，失败诊断可能被包装成成功事实，写操作也缺少服务端生成的确认闭环。

## 调整思路

本次 M1 不接生产 `/api/chat`，也不接真实 LLM 或业务 tool，只在 `agent-core` 内建立可测试的安全底座：

- `ResourceStore` 成为当前 run 内资源事实来源。
- `ToolResourceContract` 描述 tool 的 requires / produces。
- `Policy Guard` 在 Executor 前统一裁决权限、风险、副作用和 confirmation。
- confirmation pending action 与 action hash 只由服务端生成。
- diagnostic resource 只能作为阻断、澄清或失败证据，不能支撑成功 final answer。

## 关键改动

- 新增 `resource-store.ts`、`resource-contract.ts`、`policy-guard.ts`、`confirmation-store.ts`。
- 扩展 `contracts.ts` 中的资源、策略、confirmation、stream event 和 `ToolResult.fulfillment` 合同。
- Runtime 在 tool handler 前执行资源合同与策略校验，在 handler 后执行 produced resource 合同校验并登记资源。
- Response Renderer 新增 confirmation request 白名单事件，并继续避免完整 tool output 默认进入用户事件。
- 新增 M1 fixture producer / consumer / confirmation write / diagnostic failure tools 和 trace summary。
- 新增 `tests/agent-core/**` 覆盖资源、策略、确认、诊断 grounding、renderer 安全投影和架构边界。

## 验证结果

- `npm test -- tests/agent-core`：8 个测试文件、34 个测试通过。
- `npm run typecheck`：通过。
- 架构扫描确认 M1 未接入 production `/api/chat`、未注册真实业务 tool、未导入旧 `agent-orchestrator`。
