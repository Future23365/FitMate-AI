## Why

核心聊天链路已经重构为 Tool-first `AgentOrchestrator`，但 `/dev/ai-traces` 仍主要沿用旧版 intent-first 编排视角组织日志。开发者排查问题时需要在旧阶段、原始 JSON 和 Agent 新阶段之间来回对应，难以快速判断问题发生在上下文构建、工具决策、工具执行、校验、持久化、回复生成还是后处理阶段。

本 change 需要把日志页面重构为面向 Tool-first Domain Agent Orchestrator 的诊断工作台，让现架构下的主要失败模式、数据依赖和用户可见结果可以被直接定位。

## What Changes

- 重构 `/dev/ai-traces` 的信息架构，默认按 Agent run 展示 ContextPackage、tool loop、validator / policy gate、persistence、Response Writer、summary update 等阶段。
- 新增 Agent 诊断总览，直接展示本轮最终结果、用户可见回复、关键资源 id、工具调用序列、失败 code、token / latency 分账和旧路径防回归信号。
- 将旧版 intent-first 阶段降级为兼容视图或 legacy 区域，不再作为 Tool-first 主链的默认排查顺序。
- 为 tool decision、tool result、candidateSetId、artifactPayloadId、validationId、policyDecisionId、confirmationId、revisionId 等关联字段提供可读摘要和跳转式定位。
- 强化错误排查入口，按问题类型聚合 schema / repair、unknown tool、permission、candidate empty、validation、policy blocked、persistence、response writer、post-processing 等失败。
- 保留原始 JSON、全链路 log 保存、用户问答记录保存和旧 trace 的基本可读性。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `ai-trace-debugger`: 将 `/dev/ai-traces` 从旧版流程调试页调整为 Tool-first Agent 诊断页，新增 Agent run 总览、工具链路、资源关联、错误聚合和 legacy 兼容展示要求。

## Impact

- 主要影响 `components/dev/ai-trace-viewer.tsx` 和其内部 trace 分组、摘要、字段解释、保存 log payload 构造逻辑。
- 可能影响 `app/dev/ai-traces/page.tsx`、`app/api/dev/ai-traces/route.ts`、`lib/server/dev/ai-trace-store.ts` 中与页面读取、保存和 trace 类型描述相关的代码。
- 不改变 `/api/chat` 对外请求/响应合同，不新增数据库表，不改变 AI 语义决策边界。
- 需要补充或调整前端组件单元测试、trace fixture 测试，并运行 `npm run typecheck`、相关测试和 `openspec validate`。
