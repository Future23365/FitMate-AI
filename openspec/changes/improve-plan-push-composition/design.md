## Context

当前 `/api/ai/workout-plan` 已经区分 `plan` 和 `routine`，其中 `routine` 草稿拥有 `warmup`、`training`、`stretch` 三段式 sections，并可无损转换为 `WorkoutRoutine`。长期 `plan` 草稿仍是 `days[].items` 扁平结构，保存时每个训练日会被转换成一个 `WorkoutRoutine`，但所有动作都会落到 `section: "training"`，导致热身和拉伸语义在长期计划链路中丢失。

长期计划卡片当前还承担导入排期能力：用户在聊天流中确认计划后，前端把每个训练日保存成 routine，再按固定 weekday map 创建未来 1 周或 4 周 schedule。这条链路能完成基础导入，但没有显式表达计划层分工、恢复间隔、训练日差异和日程节奏，容易让计划看起来只是多套动作的集合。

本 change 需要同时调整 AI 输出结构、Zod schema、服务端校验、卡片展示、保存转换和测试。项目仍处于早期阶段，因此优先选择清晰的一次性结构替换，不保留旧 `days[].items` 兼容层。

## Goals / Non-Goals

**Goals:**

- 将长期计划草稿升级为计划层结构 + 多个三段式训练日。
- 让 plan 和 routine 在可执行动作结构上复用同一套 section 语义：`warmup`、`training`、`stretch`。
- 让长期计划生成体现周频率、训练日分工、训练顺序、恢复间隔和训练量边界，而不是生成重复或随机的多日 routine。
- 让计划卡片能展示计划层摘要、训练日分工、分段动作和导入排期预期。
- 保存计划时，每个训练日转换出的 `WorkoutRoutineItem.section` 必须保留原始 section。
- 补齐 schema、validation、conversion、AI prompt 和 UI 层测试。

**Non-Goals:**

- 不引入新的数据库表或 Prisma schema。
- 不新增独立的长期计划持久化模型；计划导入后仍落到 `WorkoutRoutine` 和 `WorkoutSchedule`。
- 不重做 `/plans` 页面、训练执行页或日历页面视觉。
- 不改变单次 routine 的三段式输出结构。
- 不把医疗诊断、康复治疗或高风险伤病方案纳入 AI 生成能力。

## Decisions

### 1. 用 `WorkoutPlanDaySectionDraft` 替换 `days[].items`

长期计划训练日改为：

- `dayType`: 标记训练日角色，例如 strength、cardio、mobility、recovery、mixed。
- `focus`: 说明当天目标。
- `sections`: 固定包含 `warmup`、`training`、`stretch` 三段。
- 每个 section 内使用和 routine item 一致的动作参数，并要求 item.section 与所属 section 一致。

取舍：保留旧 `items` 再新增 `sections` 会让保存和展示长期处在双结构分支里，后续更容易再次丢失 section。直接替换结构是 breaking change，但当前还未上线，能让 plan 和 routine 的可执行语义统一。

### 2. 计划层增加结构化编排字段，而不是只靠自然语言 summary

`WorkoutPlanDraft` 增加计划层字段：

- `durationWeeks`: 默认 4 周，用于说明计划周期和排期预期。
- `progression`: 说明强度或训练量如何递进。
- `recoveryStrategy`: 说明休息日、低强度日或恢复安排。
- `schedulePattern`: 按训练日顺序描述推荐训练节奏，例如间隔训练日、连续训练日上限和每周训练日数。

取舍：只在 `summary` 里写这些信息无法被卡片、保存逻辑和测试稳定消费。结构化字段能让计划推送更可解释，也能让排期逻辑不再依赖硬编码 weekday map 的隐含策略。

### 3. 计划生成分两层约束：先计划骨架，再填训练日

Prompt 需要明确长期计划生成顺序：

1. 根据用户目标、经验、频率、时长、器械和限制确定计划层目标与周结构。
2. 为每个训练日分配不同角色、重点和训练量。
3. 为每个训练日生成热身、主训练、拉伸。
4. 所有 `exerciseId` 必须来自候选集合，热身和拉伸优先使用 supplementary candidates。

取舍：单纯要求模型“不要乱”不足以稳定改变输出。把计划层骨架写进 schema 和 prompt，服务端再校验训练日差异，才能避免生成几天相同动作的表面计划。

### 4. 保存转换复用 routine 模型，但保留 section 和训练节奏

`convertWorkoutPlanDraftToWorkoutRoutine()` 需要读取某个 `WorkoutPlanDayDraft.sections`，按 `warmup -> training -> stretch` 顺序平铺为 `WorkoutRoutine.items`，并保留 `section`、动作参数、阶段间休息和主训练循环配置。

取舍：新增长期计划数据库模型可以保留更多周期信息，但会扩大数据迁移、日历、训练页和统计链路范围。当前目标是把聊天计划推送变成可执行、可排期的 routine/schedule 集合，因此继续落在现有持久化模型更稳。

### 5. 排期从硬编码 weekday map 迁移为计划节奏解释器

前端导入时根据 `schedulePattern` 和 `weeklyFrequency` 生成未来 1 周或 4 周 schedule：

- 训练日按 `draft.days` 顺序循环。
- 同一训练日角色不得因为频率高而连续重复，除非 `weeklyFrequency = 7`。
- 休息日 schedule 继续显式创建为 `status: "rest"`。
- 替换旧安排仍限定在同一 `sourceRoutineTitle` 和导入区间内。

取舍：完全交给 AI 输出具体日期会受当前日期、时区和用户修改影响，且难以测试。用结构化计划节奏 + 本地确定性排期，可以保持生成可解释并降低错误率。

### 6. 计划卡片展示计划层和训练日层，动作条目复用相邻布局 change 的共享边界

计划卡片负责展示：

- 计划标题、目标、周期、周频率、单次时长。
- `progression`、`recoveryStrategy`、训练日角色和焦点。
- 当前训练日的三段式动作。
- 导入后未来 1 周或 4 周的训练/休息节奏预览。

动作条目内部布局与 `sync-plan-card-item-layout` 相邻；本 change 只要求长期计划具备三段式数据和分段展示语义，不重复定义具体条目 UI 细节。

## Risks / Trade-offs

- [Risk] AI 输出新结构后，旧聊天历史里的 plan 草稿无法直接渲染。→ Mitigation: 这是主动 breaking change；历史草稿可显示通用错误态或要求重新生成，不保留旧结构转换。
- [Risk] 候选动作中热身或拉伸不足，导致三段式 plan 生成失败。→ Mitigation: 候选服务必须为 plan 补充 warmup/stretch supplementary candidates；校验失败时返回明确错误和 trace。
- [Risk] 训练日差异校验过严，少器械场景误报。→ Mitigation: 校验要求“训练重点或动作组合存在差异”，不强制每天完全不同；在自重或动作库有限时允许部分复用。
- [Risk] 排期解释器和 AI 的 `schedulePattern` 表述不一致。→ Mitigation: `schedulePattern` 使用结构化字段，卡片文案只展示解释结果；测试覆盖周频率 1-7 的排期。
- [Risk] 与 `sync-plan-card-item-layout` 同时修改计划卡片可能产生冲突。→ Mitigation: 本 change 先定义数据与分段容器，条目内部共享组件以已有 change 为准；实现时先落数据结构，再接入共享条目。

## Migration Plan

1. 更新 `WorkoutPlanDraft` schema、类型和 prompt，使新生成的长期计划只输出三段式结构。
2. 更新 plan validation 和 candidate validation，拒绝缺少三段式 sections、非法 section 或不符合候选集合的动作。
3. 更新 conversion 和计划卡片，移除旧 `days[].items` 读取路径。
4. 更新导入排期逻辑，使用结构化 schedule pattern 生成 schedules。
5. 更新测试和文档。
6. 如上线后发现生成质量不稳定，回滚本 change 时回滚 schema/prompt/card/conversion 为同一提交，不保留混合结构。

## Open Questions

- `durationWeeks` 是否固定为 4 周，还是允许用户显式要求 6-12 周计划时生成更长周期说明；本 change 默认支持结构字段，但导入范围仍只提供未来 1 周或 4 周。
- `schedulePattern` 的字段名与具体枚举可以在实现时按类型可读性细化，但必须保持结构化、可校验、可测试。
