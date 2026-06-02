# legacy intent allowlist

记录时间：2026-06-02 13:28:32 CST

本文件记录 `remove-legacy-intent-architecture` 与 `remove-legacy-chat-ai-interfaces` 后允许继续出现的旧架构标识边界。默认规则是 deny-by-default：未列入本文件的旧 intent-first、旧只读 loop、旧 `assistant_action` / `intent_resolved`、旧 trigger JSON、旧聊天 AI 独立 route 和旧前端 route helper 不得被 active Route Handler、生产 `/api/chat`、Agent runtime、Response Writer、前端新流解析、生产导出、领域服务或当前 OpenSpec 主规格导入或要求。

## 允许保留

- 历史文档：`docs/方案变更历史/**` 和旧归档 OpenSpec 可继续描述当时方案，只作为演进记录。
- 测试断言文本：测试可使用旧字段名断言它们不会出现在新生产流或 Agent 工具列表中。
- 黑盒 forbidden metadata：`manual-tests/llm/flow-fixtures.ts` 可以保留 `legacyIntentNormalize`、`runReadonlyToolLoop` 等 forbidden 名称，用于证明旧路径未触发。
- Trace 兼容展示：`components/dev/**` 和 `tests/fixtures/agent-traces.ts` 可保留 legacy trace 展示能力，用于查看历史 trace，不作为新运行执行事实源。
- 黑盒/trace 引用诊断：`referenceResolutionStatus`、`referenceResolutionSummary` 和 `ReferenceResolutionDiagnostic` 只能表示 Agent artifact tool result 的诊断投影，不得重新引入独立 resolver schema、service 或执行分支。
- 领域字段来源类型：`ResolvedFieldSource` / `ResolvedFieldSources` 暂作为字段来源枚举保留，不能重新引入 `ResolvedChatIntent` 执行合同。
- 历史展示清理：`features/chat/components/chat-page.tsx` 可保留纯展示型旧 trigger JSON 文本剥离逻辑，但不得解析 intent、生成 suggested replies 或触发任何卡片。

## 禁止保留

- 生产聊天入口不得导入 `ResolvedChatIntent`、`ChatIntent`、`workoutIntent` 解析 schema、旧 `resolveChatIntent`、resolved intent repair 或旧 action gate。
- 生产流不得输出 `assistant_action`、`intent_resolved` 或旧 trigger JSON。
- 生产工具编排不得导入或调用 `runReadonlyToolLoop`、`ReadonlyToolDecision`、`ENABLE_READONLY_LLM_TOOLS` 触发矩阵或旧只读 context bundle。
- 前端新流解析不得依赖旧 action 事件触发训练卡片。
- active Route Handler 不得暴露旧聊天 AI 独立接口；聊天计划、routine、动作推荐和推荐刷新只能通过 `/api/chat` Agent-first 合同或已存在 Agent result 的确定性操作表达。
- 前端 client / hook 不得保留旧聊天 AI route helper、旧推荐刷新请求或旧训练计划草稿请求。
- 生产目录不得导出只服务旧聊天 AI route 的计划/推荐生成服务。
- 生产目录不得保留旧 `reference-resolver-service` 或旧 `workout-patch-chat-service`；artifact 引用、payload 读取和 Patch 生成必须通过 Agent tools、artifact service、`WorkoutEditPlan`、`proposeWorkoutPatch`、`validateWorkoutPatch` 或 `workout-patch-engine` 的受控合同表达。
- 当前 OpenSpec 主规格不得正向要求旧聊天 AI 独立 route、旧 trigger parser 或旧前端 fallback 存在。

## 扫描范围

- active Route Handler：`app/api/**/route.ts`
- 前端新流：`features/chat/api/**`、`features/chat/hooks/**`、`features/chat/components/**`
- Agent 主链：`lib/server/chat/**`、`lib/server/agent-orchestrator/**`
- 领域服务与生产导出：`lib/server/**`、`lib/shared/**`
- 当前主规格：`openspec/specs/**`
- 防回归测试：`tests/legacy-chat-interface-cleanup.test.ts`
