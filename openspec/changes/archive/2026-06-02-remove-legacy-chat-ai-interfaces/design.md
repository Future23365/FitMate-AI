## Context

`remove-legacy-intent-architecture` 已经把生产 `/api/chat` 主链收敛到 Tool-first `AgentOrchestrator`，并建立了 `docs/legacy-intent-allowlist.md`。但当前代码和主规格仍保留旧聊天 AI 执行面：

- `app/api/ai/workout-plan/route.ts` 和 `app/api/ai/exercise-recommendations/route.ts` 仍是 active Route Handler。
- `features/chat/api/chat-client.ts` 仍暴露旧计划/推荐请求 helper，`features/chat/hooks/use-chat-controller.ts` 仍有推荐刷新活调用。
- `features/chat/lib/workout-plan-trigger.ts` 和聊天页面仍保留旧 trigger JSON 解析/清理逻辑。
- `openspec/specs/test-coverage/spec.md` 仍要求测试旧 `/api/ai/*` route 和 trigger parser。
- 一些旧模块虽然不在 `/api/chat` 主链上，但仍位于生产目录并被测试引用，容易被误用为未来 fallback。

这个 change 是对旧架构删除工作的补漏。它不重新设计 AgentOrchestrator，而是把所有仍暴露给生产路由、前端新流解析、测试规格和生产目录的旧接口面收掉。

## Goals / Non-Goals

**Goals:**

- 删除旧 `/api/ai/workout-plan` 和 `/api/ai/exercise-recommendations` route 及其前端调用。
- 删除旧 trigger JSON parser 和从 assistant 文本触发卡片的前端路径。
- 修正当前测试规格，删除对旧 route、旧 trigger parser 的正向覆盖要求。
- 将推荐刷新、计划草稿和 routine 卡片触发统一到 Agent-first 合同。
- 扩展 legacy allowlist 防回归扫描，覆盖 active Route Handler、前端新流解析、生产目录模块、测试和当前 OpenSpec 主规格。
- 保持“LLM 负责语义、服务端只做契约校验”的边界，清理过程中不得新增关键词、正则、同义词或短句模板来替 LLM 判断用户意图。

**Non-Goals:**

- 不新增新的独立 AI route 来替代旧 `/api/ai/*` route。
- 不把旧推荐刷新逻辑包装成新名字继续保留。
- 不删除历史方案文档或归档 OpenSpec 中的历史记录。
- 不改变动作库、训练计划、routine、patch 的确定性结构校验规则。
- 不要求本提案阶段修改业务代码；代码删除、测试迁移和文档同步在 apply 阶段执行。

## Decisions

### 1. 删除旧 route，而不是保留为兼容代理

选择：`/api/ai/workout-plan` 和 `/api/ai/exercise-recommendations` 从聊天 AI 能力中删除，不再转发到 `/api/chat` 或 Agent 工具。

原因：兼容代理会让调用方继续绕过 `/api/chat` 的 Agent 执行合同，并保留“旧接口只是换了内部实现”的误导。真正的收敛应让所有聊天 AI 结果都从同一个 Agent stream 和结果合同出来。

替代方案是让旧 route 返回 410。这个方案可以作为迁移期保护，但不能替代删除前端调用和测试正向要求；实现阶段如果保留 410，也必须证明前端不会主动调用。

### 2. 推荐刷新必须迁移到 Agent-first 流程

选择：`换一批/刷新推荐` 不再调用 `/api/ai/exercise-recommendations`。实现阶段要么通过 `/api/chat` 发起一次明确的 Agent 请求并消费新推荐结果，要么基于已保存的 Agent candidate/result 做确定性分页或重排；两种方式都不得读取用户原文做服务端语义纠偏。

原因：当前旧接口仍是活路径，且内部存在基于 intent/preferences/equipment 的服务端规则映射。继续保留会绕开 Agent 对本轮语义、上下文和工具证据的统一决策。

### 3. 旧 trigger JSON parser 必须从前端新流移除

选择：新聊天流只消费 `agent_execution_result`、artifact / patch / suggestion 事件和 done metadata，不再从 assistant 文本中解析 `workout_plan_trigger`、`exercise_recommendation_trigger` 或类似旧 trigger JSON。

原因：旧 parser 会把自然语言回复重新变成可执行卡片触发器，等于在前端保留第二执行路径。历史消息清理如确需保留，必须放在历史展示兼容边界，并证明新流不会调用。

### 4. 生产目录 legacy 模块默认删除或隔离

选择：旧 `reference-resolver`、旧 workout patch chat service、旧 intent/trigger helper 等模块如果只被测试引用，应删除或移动到测试 fixture / 历史兼容 / 离线迁移边界；不能继续作为生产导出存在。

原因：allowlist 只限制 `/api/chat` 主链不够。只要旧模块仍在生产目录，未来实现很容易重新导入它们作为 fallback 或“快速修复”。

### 5. 测试规格先修正，再改测试代码

选择：本 change 先删除当前主规格中对旧 route 和 trigger parser 的正向测试要求，替换为旧接口缺席和旧前端调用缺席的防回归测试要求。

原因：如果主规格仍要求旧接口测试，后续实现删旧 route 会和测试覆盖目标冲突，导致清理再次半途停下。

## Risks / Trade-offs

- [Risk] 删除旧 route 后仍有前端按钮或测试调用旧接口 → Mitigation：实现阶段必须先跑静态引用扫描，再迁移或删除前端调用，最后增加 route 缺席/前端调用缺席测试。
- [Risk] 推荐刷新语义不清晰，迁移时又在服务端写规则判断“换一批” → Mitigation：刷新入口必须交给 Agent 请求或已存在 Agent result 的确定性分页，不允许新增自然语言关键词纠偏。
- [Risk] 历史聊天消息中仍含旧 trigger JSON → Mitigation：历史展示兼容与新流解析分离；新运行不得解析旧 trigger 生成卡片。
- [Risk] 旧模块被测试依赖，直接删除导致大量测试失败 → Mitigation：先区分生产依赖和测试 fixture；测试需要的历史样本迁移到测试目录，不保留生产导出。
- [Risk] 只更新代码但忘记主规格 → Mitigation：tasks 明确要求同步 `openspec/specs/test-coverage/spec.md`、legacy allowlist、架构文档和方案历史。

## Migration Plan

1. 审计并列出旧 route、旧 client helper、旧 trigger parser、旧生产目录模块和测试/规格引用。
2. 设计推荐刷新迁移方式：优先复用 `/api/chat` Agent 请求；如果使用本地已有结果重排，必须限定为确定性 result-level 操作。
3. 删除旧 route 和前端旧调用，迁移或删除对应测试。
4. 删除或隔离旧 parser/helper/module，更新 import 边界。
5. 更新主规格、legacy allowlist、架构文档和方案变更历史。
6. 运行引用扫描、相关测试、typecheck 和 build，证明旧接口无法被新聊天流程触发。

## Audit Results

记录时间：2026-06-02 13:35:50 CST

- active Route Handler：`/api/ai/workout-plan` 和 `/api/ai/exercise-recommendations` 删除，不保留 410 代理或兼容转发。
- 旧前端 helper：`requestWorkoutPlanDraft`、`requestExerciseRecommendations` 删除；`requestChatStream` 是聊天 AI 请求入口。
- 旧 trigger parser：`features/chat/lib/workout-plan-trigger.ts` 删除；`chat-page.tsx` 仅保留历史展示型旧 JSON 文本剥离，不解析 intent、不生成 suggested replies、不触发卡片。
- 旧计划/推荐服务：`ai-workout-plan-service`、`ai-exercise-recommendation-service` 删除，计划/routine/推荐由 Agent tools、`AgentExecutionResult` 和 artifact 事件表达。
- 旧引用/Patch 入口：`reference-resolver-service`、`workout-patch-chat-service` 和旧 `lib/shared/reference-resolver/schema.ts` 删除；artifact 定位、payload 读取和 Patch 合同迁移到 Agent artifact tools、`WorkoutEditPlan`、`proposeWorkoutPatch`、`validateWorkoutPatch` 与 `workout-patch-engine`。
- 当前主规格：`openspec/specs/test-coverage`、`plan-push-composition`、`api-layer-boundaries`、`reference-resolver`、`domain-plan-engine`、`workout-patch`、`rag-hybrid-search` 和 `workout-validation-boundary` 已改为 Agent-first / tool-result 边界。
- 防回归测试：新增 `tests/legacy-chat-interface-cleanup.test.ts`，扫描旧 route、旧 helper、旧 parser、旧 route-only service、旧 resolver / patch chat service、旧 shared resolver schema 和当前主规格正向要求。

## Resolved Apply Decisions

- 推荐刷新不再有旧 `/api/ai/exercise-recommendations` 活路径；当前前端不保留旧 helper，后续如需要“换一批”语义刷新，应作为 `/api/chat` Agent 请求或已存在 Agent result 的确定性操作实现。
- 历史消息中的旧 trigger JSON 继续做纯展示清理，因为直接展示会污染旧会话可读性；该逻辑不解析旧 trigger，也不进入生产执行路径。
