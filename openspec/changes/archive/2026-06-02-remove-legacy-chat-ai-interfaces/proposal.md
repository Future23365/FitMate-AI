## Why

上一轮 `remove-legacy-intent-architecture` 已经把 `/api/chat` 主链迁到 Tool-first `AgentOrchestrator`，但旧 AI 独立接口、前端旧 client/helper、旧 trigger JSON parser、测试规格和部分生产目录 legacy 模块仍然存在。它们会继续给后续开发传递“双执行面”的错误信号：Agent 是主链，但旧 `/api/ai/*`、旧推荐刷新、旧 plan trigger 和旧测试合同仍可被当成备用执行路径。

本 change 用来补齐清理边界：删除旧聊天 AI 接口和旧触发面，修正测试与规格中仍要求旧接口存在的矛盾，并把 legacy allowlist 防回归扫描扩大到 Route Handler、前端调用、测试规格和生产目录模块。

## What Changes

- **BREAKING**：删除面向聊天主链的旧独立 AI 接口 `/api/ai/workout-plan` 和 `/api/ai/exercise-recommendations`；聊天计划、routine、动作推荐和刷新推荐必须经由 `/api/chat` 的 Agent 工具结果、artifact / suggestion 事件或明确的新 Agent 合同表达。
- **BREAKING**：删除前端旧 client helper、旧 trigger JSON parser 和旧 trigger 清理逻辑；新聊天流不得从 assistant 文本中解析 `workout_plan_trigger`、`exercise_recommendation_trigger` 或其他旧 trigger JSON 来触发卡片。
- **BREAKING**：删除当前测试规格中对 `/api/ai/workout-plan`、`/api/ai/exercise-recommendations` 和 trigger parser 的正向覆盖要求，替换为旧接口不存在、旧 trigger 不参与生产新流、前端不调用旧 route 的防回归要求。
- 将“换一批/刷新推荐”等仍依赖旧 `/api/ai/exercise-recommendations` 的前端流程迁移或重新收敛到 Agent-first 合同；实现阶段不得通过服务端关键词、正则或用户原文规则替 LLM 重新判断语义。
- 将旧 `reference-resolver`、旧 workout patch chat service、旧 intent/trigger helper 等仍位于生产目录但只被测试引用的模块纳入审计；能删除则删除，确需保留则移动到测试 fixture、历史兼容或离线迁移边界。
- 扩展 `docs/legacy-intent-allowlist.md` 的检查口径：allowlist 外旧架构标识不得出现在 active Route Handler、前端新流解析、生产导出、领域服务依赖和当前 OpenSpec 主规格中。
- 增加自动化验证：扫描生产代码和当前规格，证明旧 `/api/ai/*` route、旧 trigger parser、旧独立推荐/计划 client 和旧语义解析模块不能被新聊天流程触发。

## Capabilities

### New Capabilities

- `legacy-chat-interface-cleanup`: 定义旧聊天 AI 接口、旧 trigger/fallback、旧前端调用和旧规格残留的删除边界与防回归验收。

### Modified Capabilities

- `chat-intent-decision-flow`: 扩展旧架构移除要求，覆盖 active Route Handler、前端新流解析和生产目录 legacy 模块，而不只覆盖 `/api/chat` 主链。
- `chat-exercise-recommendation-trigger`: 删除旧 `/api/ai/exercise-recommendations` 推荐刷新触发合同，改为 Agent-first 推荐结果和刷新边界。
- `plan-push-composition`: 删除旧 `/api/ai/workout-plan` 计划草稿接口和旧 plan trigger 作为聊天计划入口的合同。
- `chat-routine-composition`: 删除旧 trigger JSON 解析 routine/训练卡片的前端入口要求。
- `test-coverage`: 删除旧 AI route 和旧 trigger parser 的正向测试要求，新增旧接口缺席和旧前端调用缺席的防回归测试要求。

## Impact

- 影响接口和路由：`app/api/ai/workout-plan/route.ts`、`app/api/ai/exercise-recommendations/route.ts` 及其测试。
- 影响前端聊天调用：`features/chat/api/chat-client.ts`、`features/chat/hooks/use-chat-controller.ts`、`features/chat/lib/workout-plan-trigger.ts`、`features/chat/components/chat-page.tsx` 及相关测试。
- 影响旧生产目录模块审计：`lib/server/reference-resolver/*`、旧 workout patch chat 入口、旧 intent/trigger helper、旧推荐/计划服务中仅为聊天旧接口存在的入口。
- 影响当前规格和文档：`openspec/specs/test-coverage/spec.md`、聊天触发/计划/routine/intent 相关规格、`docs/legacy-intent-allowlist.md`、架构文档和方案变更历史。
- 不新增数据库表、外部依赖或新的公开旧兼容 API；如需要新的 Agent-first 推荐刷新合同，必须复用 `/api/chat` 或明确在本 change 的设计中定义，不能复活旧 `/api/ai/*` 语义接口。
