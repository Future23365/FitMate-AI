## Context

训练助手需要记住用户明确反馈，但不同反馈的生命周期不同。“不喜欢俯卧撑”可以长期影响推荐，“今天不想练腿”只能影响当前或短期安排，“肩膀不舒服”需要保守处理且不能被当成医疗诊断。这个 change 建立用户记忆和动作反馈的服务端边界。

## Goals / Non-Goals

**Goals:**

- 区分显式资料、动作反馈、健康/不适信号、训练行为和临时上下文。
- 支持长期 dislike、too_hard、临时偏好和健康风险信号的结构化写入。
- 给推荐、Patch、PlanEngine 和 Validator 提供统一读取入口。
- 防止临时上下文污染长期用户画像。

**Non-Goals:**

- 不实现完整医疗诊断或治疗建议。
- 不实现复杂向量记忆；本阶段以结构化持久化和显式字段为主。
- 不实现推荐去重的完整排除集合；去重属于 `change-007-recommendation-dedup`。

## Decisions

### Decision 1: 记忆按类型和有效期分层

`UserMemory.kind` 区分 explicit_preference、exercise_feedback、constraint、temporary_context 和 injury_or_pain_signal。临时上下文必须有 `expiresAt` 或短期作用域，不能写成永久画像。

### Decision 2: 动作反馈独立可查询

动作级反馈需要按 `exerciseId` 查询并参与候选过滤和替代排序。可以用 `UserExerciseFeedback` 独立表，或用 `UserMemory` 的 `subjectType = "exercise"` 表达，但服务层必须提供动作反馈查询接口。

### Decision 3: 当前消息优先级最高

用户本轮明确表达的目标或限制优先于历史记忆。历史记忆用于补足上下文，不得覆盖当前消息里的新约束。

### Decision 4: 高影响写入需要确认

“以后都不要这个动作”、健康/不适信号、长期限制和高影响训练偏好默认进入 confirmation 流程或标记 `requiresConfirmation`，避免 AI 自作主张修改长期画像。

## Risks / Trade-offs

- [Risk] 记忆写入过多导致画像污染。→ Mitigation: 使用 kind、confidence、expiresAt、status 和 confirmation gate 控制写入。
- [Risk] 健康信号被误当成医疗建议。→ Mitigation: 只作为训练保守约束，不生成诊断或治疗方案。
- [Risk] 历史偏好压过当前需求。→ Mitigation: 上下文构建器固定当前消息优先。
