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

### Decision 2: DomainPlanEngine 以 artifact 为输入事实

当用户说“三周都练这个”时，ReferenceResolver 先定位 routine artifact，PlanStrategy 引用 `sourceArtifactId`，DomainPlanEngine 使用 artifact payload 展开计划。引擎不从 `conversationSummary` 恢复完整动作结构。

### Decision 3: 递进策略保持保守

第一版只支持 `none`、`volume_small_increase` 和 `difficulty_small_increase`，并受用户水平、动作难度、风险和疲劳边界限制。无法安全递进时保持原动作结构并说明原因。

### Decision 4: schedule preview 与实际写入分离

DomainPlanEngine 生成的是 plan draft 或 schedule preview。实际写入 `WorkoutSchedule` 前仍需 Policy、Confirmation Gate 和持久化校验，避免用户一句话直接覆盖未来安排。

## Risks / Trade-offs

- [Risk] 策略枚举不足以覆盖所有自然语言计划。→ Mitigation: 第一版用 `custom` 保留扩展口，但仍要求服务端校验和可解释输出。
- [Risk] 过度确定性导致计划不够丰富。→ Mitigation: 动作选择仍可从合法候选池中排序选择，但训练日和频率由领域规则约束。
- [Risk] 用户缺少频率或时长时无法展开。→ Mitigation: 使用用户画像默认值；缺少核心条件时追问，不生成虚假计划。
