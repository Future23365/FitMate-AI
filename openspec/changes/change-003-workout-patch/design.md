## Context

引用解析能定位用户指向的 artifact，但用户真正想要的经常是局部修改：替换一个动作、降低某个动作难度、移除不喜欢的动作。当前如果重新生成整份 routine 或 plan，会破坏用户没有要求修改的部分，也无法证明哪些内容被改动。

## Goals / Non-Goals

**Goals:**

- 定义 `WorkoutPatch` / `PlanPatch` 的 locator、operation、scope 和保留语义。
- 实现 PatchEngine 的目标职责：读取目标、应用局部修改、输出 diff 和新 revision。
- 实现 PatchValidator，确保未点名内容保持不变，替代动作满足训练约束。
- 默认保护已完成 schedule，不误改历史训练。
- 第一版覆盖单动作替换、降低难度、移除动作并必要替换。

**Non-Goals:**

- 不实现完整日历重排、批量频率调整或跨多周训练周期重建。
- 不实现长期用户反馈写入；“以后都不要”类语义留给后续 memory / confirmation change。
- 不允许 LLM 直接写库或直接修改原 routine。
- 不改变现有动作候选和训练草稿硬校验边界。

## Decisions

### Decision 1: locator 不只使用 exerciseId

同一个动作可能在同一计划中出现多次，所以 Patch target 必须包含 artifact / routine / schedule、日期或 dayIndex、section、exerciseId 和可选 occurrenceIndex。

只用 exerciseId 会导致“换掉训练里的第一个俯卧撑”和“整套所有俯卧撑都替换”无法区分。

### Decision 2: Patch operation 显式声明 preserve

替换动作时必须声明 section、sets、reps、duration、rest、order 是否保留。默认保留未被用户点名的字段。

这样比重新生成更可控，也能让用户和 trace 看到系统到底改了什么。

### Decision 3: Patch 先作用于 artifact revision

聊天未保存草稿的修改默认产生新的 artifact revision。已保存 routine 或未来 schedule 的修改只有在后续 policy / confirmation 允许时才落到对应实体；本 change 先实现 artifact-only 和安全 new revision。

这能最快验证 Patch 语义，同时降低误改用户已有训练数据的风险。

### Decision 4: 替代动作来自受控候选

PatchEngine 不能让 LLM 自由生成 replacementExerciseId。替代动作必须来自 Exercise Retrieval Service 的候选，并经过 section、器械、难度、风险和时长校验。

候选不足时返回失败原因或澄清建议，不用模型编造动作。

## Risks / Trade-offs

- [Risk] Patch schema 过窄会挡住复杂修改。→ Mitigation: 第一版只覆盖高频单动作修改，复杂 schedule 操作在后续 change 扩展。
- [Risk] artifact revision 和 saved routine 修改边界混淆。→ Mitigation: scope 必须显式声明；默认 artifact-only，不默认覆盖已保存 routine。
- [Risk] 替代动作候选不足。→ Mitigation: 返回候选不足原因和可选追问，不绕过动作库。
- [Risk] 保留字段导致替代动作参数不合理。→ Mitigation: PatchValidator 可对替代动作的 target、sets、rest 做确定性修正或返回修复建议。
