## Context

当前 `workout-plan-validation-service.ts` 同时承担两类职责：一类是结构和事实契约校验，例如 Schema、动作 ID、候选集合和周期字段一致性；另一类是训练合理性判断，例如训练日重复、连续负荷、新手容量、休息时长、训练量偏高和 section 语义偏好。

最近日志显示，用户明确要求“今天明天后天都练这个”时，DomainPlanEngine 正确展开了基于历史 routine 的三天重复计划，但校验层因 `consecutive_load_high` 把连续重复训练当作 hard fail，导致计划卡片不能展示。这说明服务端仍在替用户和 LLM 判断训练安排是否合理，而不是只校验结构是否可执行。

## Goals / Non-Goals

**Goals:**

- 将训练草稿校验收敛为结构、事实、权限和用户明确约束的契约校验。
- 移除 `day_similarity_high`、`consecutive_load_high` 等合理性 hard fail。
- 让训练量、休息、重复度、section 语义和用户记忆偏好只作为 warning、trace 诊断或 LLM 上下文。
- 让 `session_too_long`、`session_too_short`、`weekly_frequency_mismatch` 只在用户明确提供对应约束时阻止展示。
- 修复恢复分类，让 warning 不参与“失败是否可恢复”的判断。

**Non-Goals:**

- 不移除 Schema、动作 ID、候选集合、权限和 artifact payload 校验。
- 不允许 LLM 使用候选集合外动作或不存在动作。
- 不改变训练卡片 payload、数据库结构或前端展示数据契约。
- 不在本 change 中重建完整训练科学规则或动作元数据体系。

## Decisions

### Decision 1: errors 只表达契约失败

`WorkoutPlanValidationResult.errors` 只保留服务端可确定验证的契约失败：Schema 解析失败、动作 ID 不存在、动作不在候选集合、候选集合为空、payload 内部结构计数不一致、必要字段缺失、权限越界、引用 artifact 不可用，以及用户明确约束被违反。

训练合理性问题统一写入 `warnings`。包括重复训练日、连续负荷、训练量偏高、新手容量偏高、休息偏短、section 元数据分歧和历史偏好冲突。

替代方案是保留高负荷 hard fail 并增加白名单策略，但这会继续把训练合理性判断留在服务端，后续仍会在用户明确偏好和系统保守规则之间冲突。

### Decision 2: 字段来源决定目标时长和频率是否可 hard fail

`session_too_long`、`session_too_short` 和 `weekly_frequency_mismatch` 只有在字段来源为 `current_user_message`、`history` 或 `artifact` 等明确用户上下文时，才可以进入 `errors`。

如果字段来源是 `default` 或 `llm_inferred`，服务端只能记录 warning。这样避免默认 30 分钟、默认每周 3 练或模型推断频率反过来阻止用户可见结果。

### Decision 3: 显式重复训练是合法用户意图

当 PlanStrategy 或 resolved intent 表达用户要重复历史 routine，例如 `repeat_previous_routine` 或 `repeat_same_routine_with_progression`，服务端必须允许重复训练日通过契约校验。

如果连续重复、训练量或恢复间隔值得提醒，系统应在 warning、trace 或草稿 `safetyNotes` 中表达，而不是阻止卡片展示。

### Decision 4: 失败恢复只看 errors

恢复分类服务只根据 `validation.errors` 判断是否失败、是否可恢复、是否硬边界失败。`validation.warnings` 可以参与引导文案和 trace，但不能让未知 error 被误分类，也不能让 warning 单独触发 `plan_validation_failed`。

这会修复当前 `consecutive_load_high` error 被旁边 `day_estimate_mismatch` warning 包装成泛化 recoverable 的问题。

## Risks / Trade-offs

- [Risk] LLM 生成的训练安排可能不够保守。→ Mitigation：保留 warning、trace 和自然语言提示，让 LLM 和用户共同处理合理性，而不是由服务端静默否决。
- [Risk] 旧测试依赖合理性 hard fail。→ Mitigation：更新测试，将合理性断言改为 warning，并保留结构和动作来源 hard fail 覆盖。
- [Risk] 字段来源缺失导致时长或频率不再 hard fail。→ Mitigation：实现时补齐 `PlanStrategy.fieldSources` 和 routine 生成链路的字段来源传递，缺来源时默认降级为 warning。
- [Risk] 前端继续展示 warning 过多影响体验。→ Mitigation：前端不需要默认展示所有 warning，trace 和调试页保留完整诊断即可。

## Migration Plan

1. 调整 `workout-plan-validation-service.ts`，将合理性判断统一从 `errors` 移到 `warnings`。
2. 增加字段来源输入，限制 `session_too_long`、`session_too_short` 和 `weekly_frequency_mismatch` 的 hard fail 条件。
3. 调整 `workout-plan-validation-recovery-service.ts`，只用 `errors` 分类失败，warnings 仅参与提示。
4. 更新 DomainPlanEngine / AI workout plan service 调用处，传递必要字段来源。
5. 更新单元测试和服务测试，覆盖重复三天同一套动作、字段来源默认值降级、warning 不触发失败恢复。
6. 更新变更历史文档。

## Open Questions

- 是否需要在最终聊天回复中主动提炼部分 warning，例如“连续三天练同一套时注意疲劳”？本 change 只要求不阻止卡片展示，不强制前端展示 warning。
