## ADDED Requirements

### Requirement: 长期计划必须包含计划层编排
系统 SHALL 在生成长期训练计划草稿时输出计划层编排信息，明确训练目标、计划周期、周频率、训练日分工、恢复策略、强度递进和排期节奏。

#### Scenario: 用户请求长期计划
- **WHEN** 用户提出长期训练计划需求，并且意图为 `plan`
- **THEN** 系统 MUST 生成 `kind = "plan"` 的长期计划草稿
- **AND** 计划草稿 MUST 包含 `title`、`goal`、`summary`、`durationWeeks`、`weeklyFrequency`、`estimatedSessionMinutes`、`progression`、`recoveryStrategy`、`schedulePattern`、`days` 和 `safetyNotes`
- **AND** `days.length` MUST 与 `weeklyFrequency` 一致

#### Scenario: 计划存在多个训练日
- **WHEN** 长期计划草稿包含多个训练日
- **THEN** 每个训练日 MUST 具备可区分的 `dayType`、`focus` 或动作组合
- **AND** 系统 MUST NOT 只生成多份名称不同但动作结构高度相同的训练日

### Requirement: 长期计划训练日必须同步三段式编排
系统 SHALL 将长期计划中的每个训练日表达为 `warmup`、`training`、`stretch` 三段式训练结构，并与单次 routine 使用同一套 section 语义。

#### Scenario: 系统生成训练日
- **WHEN** 系统生成长期计划中的任意训练日
- **THEN** 该训练日 MUST 包含 `sections`
- **AND** `sections` MUST 同时包含 `warmup`、`training` 和 `stretch`
- **AND** 每个 section MUST 至少包含 1 个动作

#### Scenario: 训练日动作项声明 section
- **WHEN** 训练日 section 包含动作项
- **THEN** 每个动作项 MUST 包含 `section`、`exerciseId`、`mode`、`sets`、`target`、`setRestSeconds`、`transitionRestSeconds`
- **AND** 动作项的 `section` MUST 与所属 section 一致

### Requirement: 长期计划动作必须来自服务端候选集合
系统 SHALL 对长期计划草稿中的所有动作 ID 进行服务端校验，确保 AI 只能使用本次候选集合中的动作。

#### Scenario: AI 返回计划草稿
- **WHEN** `/api/ai/workout-plan` 收到 AI 返回的长期计划草稿
- **THEN** 系统 MUST 使用 Zod schema 校验草稿结构
- **AND** 系统 MUST 校验所有 `exerciseId` 存在于数据库动作库
- **AND** 系统 MUST 校验所有 `exerciseId` 来自本次 `primaryExercises` 或 `supplementaryExercises`

#### Scenario: AI 编造动作 ID
- **WHEN** 长期计划草稿包含不存在或不在候选集合中的 `exerciseId`
- **THEN** 系统 MUST 拒绝该草稿作为有效计划
- **AND** 系统 MUST 记录可用于 AI Trace 排查的校验失败信息

### Requirement: 计划生成必须区分计划层与单次编排
系统 SHALL 保持长期 `plan` 和单次 `routine` 的意图、数据结构和卡片语义分离，同时让两者在可执行动作 section 上保持一致。

#### Scenario: 用户提出单次训练需求
- **WHEN** 用户说“今天”、“这次”、“30分钟”、“在家”或明确要求一套动作编排
- **THEN** 系统 MUST 继续生成 `kind = "routine"` 的单次编排草稿
- **AND** 系统 MUST NOT 将该请求误生成为长期 `plan`

#### Scenario: 用户提出长期计划需求
- **WHEN** 用户明确要求一周、多周、周期、长期计划或每周训练安排
- **THEN** 系统 MUST 生成 `kind = "plan"` 的长期计划草稿
- **AND** 系统 MUST NOT 使用 routine 的单日结构伪装为长期计划

### Requirement: 计划卡片必须展示计划层和三段式训练日
聊天中的长期计划推送卡片 SHALL 同时展示计划层摘要、训练日分工、三段式动作内容和导入排期预期。

#### Scenario: 用户查看长期计划卡片
- **WHEN** 聊天流展示长期计划草稿卡片
- **THEN** 卡片 MUST 展示计划标题、目标、周期、周频率、单次预估时长、递进说明和恢复策略
- **AND** 卡片 MUST 展示训练日列表或切换入口，并让用户看到每个训练日的 `dayType` 与 `focus`

#### Scenario: 用户查看某个训练日
- **WHEN** 用户选中长期计划卡片中的任意训练日
- **THEN** 卡片 MUST 按 `warmup`、`training`、`stretch` 展示当天动作
- **AND** 卡片 MUST 展示该训练日的预估时长、安全提示和训练重点

### Requirement: 计划导入必须保留三段式 section
系统 SHALL 在保存长期计划时将每个训练日转换为独立 `WorkoutRoutine`，并保留训练日内每个动作的 section。

#### Scenario: 用户导入长期计划
- **WHEN** 用户确认导入长期计划
- **THEN** 系统 MUST 为每个训练日创建一个 `WorkoutRoutine`
- **AND** 转换后的 `WorkoutRoutine.items` MUST 按 `warmup`、`training`、`stretch` 顺序保存
- **AND** 每个 `WorkoutRoutineItem.section` MUST 保留草稿中的 section

#### Scenario: 用户从导入计划进入训练
- **WHEN** 用户打开由长期计划导入生成的训练安排
- **THEN** 训练执行时间线 MUST 能读取 warmup、training 和 stretch 动作
- **AND** 主训练循环 MUST 只作用于 training section

### Requirement: 计划排期必须使用结构化节奏
系统 SHALL 根据长期计划的结构化排期节奏和周频率生成训练日与休息日 schedule，而不是只依赖硬编码 weekday map。

#### Scenario: 用户选择导入未来 4 周
- **WHEN** 用户在长期计划卡片中导入未来 4 周
- **THEN** 系统 MUST 按 `weeklyFrequency` 和 `schedulePattern` 生成未来 4 周的 `WorkoutSchedule`
- **AND** 训练日 MUST 按计划草稿中的训练日顺序循环安排
- **AND** 非训练日 MUST 生成 `status = "rest"` 的休息安排

#### Scenario: 计划被重复导入
- **WHEN** 用户再次导入同一长期计划
- **THEN** 系统 MUST 只替换导入区间内同一 `sourceRoutineTitle` 的旧安排
- **AND** 系统 MUST NOT 删除用户手动创建或其他计划来源的 schedule
