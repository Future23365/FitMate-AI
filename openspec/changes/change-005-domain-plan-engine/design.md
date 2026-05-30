## Context

长期计划目前容易把 LLM 输出当成完整计划事实。随着用户要求“重复这套三周”“一周四练但别太累”“保留动作但调整频率”，服务端必须能根据引用对象和策略确定性展开计划，而不是每轮重新生成一份不可控日历。

## Goals / Non-Goals

**Goals:**

- 用 `PlanStrategy` 表达长期计划策略、周期、频率、时长、递进和强度偏置。
- 用 `DomainPlanEngine` 展开训练日、休息日、周期递进和 schedule preview。
- 支持从 routine artifact 或 plan artifact 派生新计划。
- 保证长期计划输出可校验、可解释，并能记录 trace。

**Non-Goals:**

- 不实现复杂 Agent runtime；多步编排属于后续 orchestrator 阶段。
- 不实现向量 RAG；模糊召回属于 `change-008-rag-hybrid-search`。
- 不直接批量覆盖用户未来 schedule；写入确认由 `change-009-policy-confirmation` 控制。

## Decisions

### Decision 1: LLM 输出策略，不输出完整日历

LLM 可以判断用户是重复旧 routine、生成 weekly split、改周频率还是做 AB 交替，但最终日历展开由 `DomainPlanEngine` 执行。这样能把休息日、连续负荷和递进规则放在可测试服务端代码里。

`PlanStrategy` 第一版采用服务端结构化 schema，核心字段为：

- `goal`：计划目标，来自当前 `WorkoutPlanIntent`。
- `horizonDays`：计划预览周期，优先来自用户表达和 `calendarHorizonDays`，必须在 1 到 90 天之间。
- `weeklyFrequency`：每周训练次数，必须在 1 到 7 次之间。
- `sessionMinutes`：单次目标时长，必须在 10 到 180 分钟之间。
- `strategy`：`repeat_previous_routine`、`repeat_same_routine_with_progression`、`weekly_split`、`alternating_ab` 或 `custom`。
- `sourceArtifactId`：引用已有 routine / plan artifact 时必填。
- `progressionPolicy`：`none`、`volume_small_increase` 或 `difficulty_small_increase`。
- `intensityBias`：`conservative`、`normal` 或 `challenging`。
- `constraints`：当前消息中影响计划展开的自然语言约束，例如“别太累”。

### Decision 2: DomainPlanEngine 以 artifact 为输入事实

当用户说“三周都练这个”时，ReferenceResolver 先定位 routine artifact，PlanStrategy 引用 `sourceArtifactId`，DomainPlanEngine 使用 artifact payload 展开计划。引擎不从 `conversationSummary` 恢复完整动作结构。

`/api/chat` 只负责把已解析的 `referenceResolution` 放入 `assistant_action`；`/api/ai/workout-plan` 收到该引用后，通过 `getArtifactPayloadForCurrentUser` 读取完整 payload。读取失败、引用类型不匹配或 payload 校验失败时，接口返回可恢复失败，引导用户重新确认引用对象，而不是回退到 LLM 自由生成。

### Decision 3: 递进策略保持保守

第一版只支持 `none`、`volume_small_increase` 和 `difficulty_small_increase`，并受用户水平、动作难度、风险和疲劳边界限制。无法安全递进时保持原动作结构并说明原因。

### Decision 4: schedule preview 与实际写入分离

DomainPlanEngine 生成的是 plan draft 或 schedule preview。实际写入 `WorkoutSchedule` 前仍需 Policy、Confirmation Gate 和持久化校验，避免用户一句话直接覆盖未来安排。

第一版输出仍复用现有 `WorkoutPlanDraft` 卡片结构，同时新增可选 `schedulePreview` 字段用于表达 1 到 `horizonDays` 的训练日/休息日展开结果。`schedulePreview` 只用于解释和后续确认，不创建 `WorkoutSchedule` 记录。

### Decision 5: Validator 校验引擎输出边界

Validator 继续校验动作 ID、section、候选来源和时长，并补充长期计划专属边界：

- 当 `calendarHorizonDays` 存在时，`days.length` 必须等于该周期，训练日数量必须匹配 `weeklyFrequency * ceil(horizonDays / 7)` 的可解释分布。
- 当 `calendarHorizonDays` 不存在时，保留现有 7 天周期语义，训练日数量应匹配 `weeklyFrequency`。
- 连续训练日如果复用高度重叠动作且训练量偏高，应返回 `consecutive_load_high` 错误。
- 引擎输出不得绕过候选或来源校验；引用 artifact 中已有动作视为合法来源，新生成动作仍必须来自候选池。

## Risks / Trade-offs

- [Risk] 策略枚举不足以覆盖所有自然语言计划。→ Mitigation: 第一版用 `custom` 保留扩展口，但仍要求服务端校验和可解释输出。
- [Risk] 过度确定性导致计划不够丰富。→ Mitigation: 动作选择仍可从合法候选池中排序选择，但训练日和频率由领域规则约束。
- [Risk] 用户缺少频率或时长时无法展开。→ Mitigation: 使用用户画像默认值；缺少核心条件时追问，不生成虚假计划。
