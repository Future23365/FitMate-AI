## Context

当前 `/api/ai/workout-plan` 已经区分 `plan` 和 `routine`，其中 `routine` 草稿拥有 `warmup`、`training`、`stretch` 三段式 sections，并可无损转换为 `WorkoutRoutine`。长期 `plan` 草稿仍是 `days[].items` 扁平结构，保存时每个训练日会被转换成一个 `WorkoutRoutine`，但所有动作都会落到 `section: "training"`，导致热身和拉伸语义在长期计划链路中丢失。

另一个更关键的问题是：当前长期计划卡片把“计划内容周期”和“导入日历范围”混在一起。用户说“计划 6 天的动作”时，产品语义更可能是一个 6 天训练周期，而不是“每周训练 6 次”，也不是固定导入未来 1 周或 4 周。旧的“未来 1 周 / 未来 4 周”按钮会把用户的计划周期强行套进日历跨度，导致计划保存和排期都不自然。

本 change 需要同时调整 AI 输出结构、Zod schema、服务端校验、卡片展示、保存转换和测试。项目仍处于早期阶段，因此优先选择清晰的一次性结构替换，不保留旧 `days[].items` 兼容层。

## Goals / Non-Goals

**Goals:**

- 将长期计划草稿升级为计划周期结构 + 多个三段式训练日。
- 区分 `cycleLengthDays`、`trainingDayCount`、`weeklyFrequency` 和日历导入范围，避免把“6 天计划”误解为“每周 6 练”。
- 让 plan 和 routine 在可执行动作结构上复用同一套 section 语义：`warmup`、`training`、`stretch`。
- 让长期计划生成体现训练日分工、训练顺序、休息日、恢复间隔和训练量边界，而不是生成重复或随机的多日 routine。
- 让计划卡片能展示计划层摘要、训练日分工、分段动作和按周期导入预期。
- 保存计划时，每个训练日转换出的 `WorkoutRoutineItem.section` 必须保留原始 section。
- 补齐 schema、validation、conversion、AI prompt 和 UI 层测试。

**Non-Goals:**

- 不引入新的数据库表或 Prisma schema。
- 不新增独立的长期计划持久化模型；计划导入后仍落到 `WorkoutRoutine` 和 `WorkoutSchedule`。
- 不重做 `/plans` 页面、训练执行页或日历页面视觉。
- 不改变单次 routine 的三段式输出结构。
- 不把医疗诊断、康复治疗或高风险伤病方案纳入 AI 生成能力。

## Decisions

### 1. 用计划周期字段替代单一 `durationWeeks`

`WorkoutPlanDraft` 增加计划周期字段：

- `cycleLengthDays`: 这个计划周期覆盖多少个自然日，例如用户说“6 天计划”时就是 6。
- `trainingDayCount`: 周期内包含多少个训练日。
- `restDayCount`: 周期内包含多少个休息或恢复日。
- `cycleRepeatable`: 说明该周期是否适合重复执行。
- `progression`: 说明强度或训练量如何递进。
- `recoveryStrategy`: 说明休息日、低强度日或恢复安排。
- `schedulePattern`: 按周期日序描述训练日和休息日，而不是只描述周几训练。

取舍：`durationWeeks` 适合“4 周减脂计划”这类周期，但不能表达“6 天动作计划”。用 `cycleLengthDays` 作为底层字段，再由文案展示“6 天周期”“4 周周期”等，更符合用户自然语言。

### 2. 明确区分三种容易混淆的用户语义

意图抽取和计划生成必须区分：

- `cycleLengthDays`: 用户说“6 天计划”“安排 6 天动作”。
- `weeklyFrequency`: 用户说“每周 6 练”“一周练 6 天”。
- `calendarHorizonDays`: 用户说“未来 6 天每天练”。

取舍：继续把这些都塞进 `weeklyFrequency` 会让计划和日历行为都变形。拆成结构化字段后，AI 可以表达计划本身，前端导入时再决定是否按周期落到日历。

### 3. 用 `WorkoutPlanDaySectionDraft` 替换 `days[].items`

长期计划训练日改为：

- `cycleDayIndex`: 周期中的第几天。
- `dayType`: 标记训练日角色，例如 strength、cardio、mobility、recovery、mixed。
- `focus`: 说明当天目标。
- `isRestDay`: 标记是否为休息或恢复日。
- `sections`: 训练日固定包含 `warmup`、`training`、`stretch`；休息日可以没有动作 sections，但必须提供恢复说明。

取舍：保留旧 `items` 再新增 `sections` 会让保存和展示长期处在双结构分支里，后续更容易再次丢失 section。直接替换结构是 breaking change，但当前还未上线，能让 plan 和 routine 的可执行语义统一。

### 4. 计划生成分两层约束：先计划周期，再填训练日

Prompt 需要明确长期计划生成顺序：

1. 根据用户目标、经验、时长、器械、限制和时间表达判断计划周期。
2. 判断用户说的是周期天数、每周频率，还是具体日历范围。
3. 在周期内安排训练日、休息日和恢复节奏。
4. 为每个训练日生成热身、主训练、拉伸。
5. 所有 `exerciseId` 必须来自候选集合，热身和拉伸优先使用 supplementary candidates。

取舍：单纯要求模型“不要乱”不足以稳定改变输出。把计划周期写进 schema 和 prompt，服务端再校验训练日差异与周期一致性，才能避免生成几天相同动作的表面计划。

### 5. 保存转换复用 routine 模型，但保留 section 和训练节奏

`convertWorkoutPlanDraftToWorkoutRoutine()` 需要读取某个非休息训练日的 `sections`，按 `warmup -> training -> stretch` 顺序平铺为 `WorkoutRoutine.items`，并保留 `section`、动作参数、阶段间休息和主训练循环配置。休息日不创建 routine，只在排期时创建 `status: "rest"` 的 `WorkoutSchedule`。

取舍：新增长期计划数据库模型可以保留更多周期信息，但会扩大数据迁移、日历、训练页和统计链路范围。当前目标是把聊天计划推送变成可执行、可排期的 routine/schedule 集合，因此继续落在现有持久化模型更稳。

### 6. 导入方式改为按周期导入和重复周期

计划卡片不再提供固定“未来 1 周 / 未来 4 周”作为主要导入选项，改为：

- `导入本周期`: 按 `cycleLengthDays` 生成一个完整周期。
- `重复 2 个周期`: 生成 `cycleLengthDays * 2` 天。
- `重复 4 个周期`: 生成 `cycleLengthDays * 4` 天。

如果用户明确给出 `calendarHorizonDays`，卡片可以额外展示“按用户指定日期范围导入”。如果用户明确说“每周 6 练”，系统可以根据 `weeklyFrequency` 和周期模板生成周节奏，但仍不把它和“6 天计划”混为一谈。

取舍：固定 1 周/4 周是实现方便，不是用户语义。按周期导入能让“6 天计划”“10 天计划”“4 周计划”都自然落到日历。

### 7. 计划卡片展示计划层和训练日层，动作条目复用相邻布局 change 的共享边界

计划卡片负责展示：

- 计划标题、目标、周期长度、训练日数量、休息日数量、单次时长。
- `progression`、`recoveryStrategy`、训练日角色和焦点。
- 当前周期内的训练日和休息日序列。
- 当前训练日的三段式动作。
- 导入本周期或重复周期后的训练/休息节奏预览。

动作条目内部布局与 `sync-plan-card-item-layout` 相邻；本 change 只要求长期计划具备三段式数据和分段展示语义，不重复定义具体条目 UI 细节。

## Risks / Trade-offs

- [Risk] AI 输出新结构后，旧聊天历史里的 plan 草稿无法直接渲染。→ Mitigation: 这是主动 breaking change；历史草稿可显示通用错误态或要求重新生成，不保留旧结构转换。
- [Risk] 候选动作中热身或拉伸不足，导致三段式 plan 生成失败。→ Mitigation: 候选服务必须为 plan 补充 warmup/stretch supplementary candidates；校验失败时返回明确错误和 trace。
- [Risk] 训练日差异校验过严，少器械场景误报。→ Mitigation: 校验要求“训练重点或动作组合存在差异”，不强制每天完全不同；在自重或动作库有限时允许部分复用。
- [Risk] `cycleLengthDays`、`weeklyFrequency` 和 `calendarHorizonDays` 的抽取仍可能混淆。→ Mitigation: prompt 给出明确对照示例，并在 manual LLM consistency tests 覆盖“6 天计划”“每周 6 练”“未来 6 天”。
- [Risk] 与 `sync-plan-card-item-layout` 同时修改计划卡片可能产生冲突。→ Mitigation: 本 change 先定义数据与分段容器，条目内部共享组件以已有 change 为准；实现时先落数据结构，再接入共享条目。

## Migration Plan

1. 更新 `WorkoutPlanDraft` schema、类型和 prompt，使新生成的长期计划只输出周期化三段式结构。
2. 更新 plan validation 和 candidate validation，拒绝缺少周期字段、三段式 sections、非法 section 或不符合候选集合的动作。
3. 更新 conversion 和计划卡片，移除旧 `days[].items` 与固定 1 周/4 周导入路径。
4. 更新导入排期逻辑，使用 `cycleLengthDays` 和重复周期数生成 schedules。
5. 更新测试和文档。
6. 如上线后发现生成质量不稳定，回滚本 change 时回滚 schema/prompt/card/conversion 为同一提交，不保留混合结构。

## Open Questions

- `cycleLengthDays` 的上限建议实现时先限制为 1-42 天，避免一次生成过大的聊天卡片；如果用户要求更长周期，优先生成可重复的中周期模板。
- `schedulePattern` 的字段名与具体枚举可以在实现时按类型可读性细化，但必须保持结构化、可校验、可测试。
