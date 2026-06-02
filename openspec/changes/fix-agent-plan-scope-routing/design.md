## Context

当前 `/api/chat` 生产主链已经切到 Tool-first `AgentOrchestrator`。Agent 需要在 `routine`、`plan`、推荐、Patch、澄清之间通过模型结构化工具决策选择下一步，服务端只负责执行工具和校验确定性合同。

最新 trace 暴露出一个 scope 路由问题：用户说“每周 4 练，每次 45 分钟”时，模型因为“每次 45 分钟”命中单次 routine 提示，先调用 `searchExercises(candidateUse="routine")`，再调用 `generateRoutineDraft`，最终保存 `kind = "routine"`。现有主规格已经要求“每周训练安排”生成 `kind = "plan"`，但 Agent prompt 和 tool description 对 routine 的强约束更明确，对 plan 的强约束不足。

## Goals / Non-Goals

**Goals:**

- 让 Tool-first Agent 在用户明确表达每周、多天、周期或长期训练安排时稳定进入 `plan` 工具链。
- 让 `generateRoutineDraft` 拒绝结构化输入中明显属于长期计划 scope 的请求，并返回可恢复反馈，要求模型改走 `generatePlanDraft`。
- 保持 AI 语义边界：服务端不读取用户原文做关键词、正则或同义词纠偏，只校验模型工具输入与工具合同是否自洽。
- 补充自动化测试和真实黑盒验证，覆盖 plan/routine scope 分流。

**Non-Goals:**

- 不处理“无器械”候选集合包含 `弹力带`、`support`、`其他` 器械的问题。
- 不改数据库 schema、Prisma migration 或训练持久化模型。
- 不恢复旧 intent-first、旧 `workout_plan_trigger` 或前端二次生成计划路径。
- 不让服务端基于用户原文关键词强制覆盖模型高层语义。

## Decisions

### 1. 用 Agent prompt 和 tool capability 明确 scope 优先级

在 `agent_tool_decision` prompt、`searchExercises` 工具描述和相关 capability summary 中补充 plan/routine 优先级：

- 用户明确请求一周、多周、周期、长期计划、每周训练安排，或模型从上下文提取到 `weeklyFrequency > 1` 时，必须使用 `candidateUse="plan"`，并继续 `generatePlanDraft`。
- 用户明确请求今天、这次、单次、一套可复用编排或只要求本次训练流程时，才使用 `candidateUse="routine"` 和 `generateRoutineDraft`。
- 当请求同时包含每周频率和单次时长时，每周频率决定 plan scope，单次时长作为 plan 中每个训练日的 `sessionMinutes`。

取舍：只补 prompt 不能保证每次都正确，但这是符合当前 AI 语义边界的第一层修复。它让模型在语义理解阶段选择正确工具，而不是让服务端根据原文重解释用户意图。

### 2. 用 `generateRoutineDraft` 入口做结构化合同兜底

`generateRoutineDraft` 已消费结构化 `WorkoutPlanIntent`。当模型调用 routine 工具时，如果输入仍包含 `intentType="routine"` 且 `weeklyFrequency > 1`，这说明模型的工具选择与自身结构化意图不自洽。工具应返回可恢复失败，例如 `plan_scope_conflict`，并在 feedback 中提示下一步应使用 plan 候选集合和 `generatePlanDraft`。

取舍：这不会捕获模型完全丢弃 `weeklyFrequency` 的情况，但不会违反“服务端不读原文纠偏”的边界。该兜底只处理模型已经输出的结构化合同冲突。

### 3. 保持 Agent repair loop 负责改走正确工具链

Runtime 已有 repair feedback 和可恢复工具失败机制。本 change 不新增独立执行通道，而是让 scope 冲突以 AgentDecisionFeedback 进入下一轮模型决策。模型必须基于 feedback、available resources 和 registry 工具定义，重新调用 `searchExercises(candidateUse="plan")` 或直接使用合法 plan 候选继续 `generatePlanDraft`。

取舍：这会多一次模型 turn，但能保持现有 Tool-first 架构一致，避免服务端直接把 routine 请求改写成 plan。

### 4. 以黑盒和单元测试共同锁定行为

单元测试覆盖工具合同和 repair feedback，黑盒测试覆盖真实 `/api/chat` 用户体验：

- `每周 4 练，每次 45 分钟` 最终应得到 `workout_plan` / `kind="plan"`。
- `今天在家练 45 分钟` 仍应得到 `workout_routine` / `kind="routine"`。
- `generateRoutineDraft` 收到 `weeklyFrequency > 1` 时不应生成或保存 routine。

取舍：黑盒测试可能受模型波动影响，因此需要配合 deterministic 工具合同测试；但真实体验回归必须保留，否则 prompt 分流问题容易复发。

## Risks / Trade-offs

- [Risk] 收紧 routine 合同后，某些“每周重复同一套训练”的请求会被导向 plan。
  → Mitigation: 这类请求本质仍是每周安排，使用 plan 展开为重复 routine 更符合当前数据结构；如果未来需要“只生成可复用 routine 并附带使用频率”，应单独定义结构字段和规格。

- [Risk] 模型可能在 routine 输入中丢弃 `weeklyFrequency`，从而绕过工具兜底。
  → Mitigation: prompt 和 tool description 必须要求保留用户明确频率；黑盒测试覆盖真实输入，发现丢字段时继续收紧模型输入合同。

- [Risk] Repair loop 多一次工具决策会增加 token。
  → Mitigation: scope 冲突只在错误工具链上触发，正常 plan 路由不增加额外 turn；相比保存错误卡片，成本可接受。

- [Risk] 只修方案一后，无器械候选边界仍可能错误。
  → Mitigation: 本 change 明确不处理候选 proof；后续用独立 change 收紧 no-equipment facet 和候选证明。
