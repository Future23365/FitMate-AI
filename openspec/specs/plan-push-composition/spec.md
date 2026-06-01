# plan-push-composition Specification

## Purpose
TBD - created by archiving change improve-plan-push-composition. Update Purpose after archive.
## Requirements
### Requirement: 长期计划必须包含计划周期编排
系统 SHALL 在生成长期训练计划草稿时输出计划周期编排信息，明确训练目标、周期天数、训练日数量、休息日数量、训练日分工、恢复策略、强度递进和周期节奏。

#### Scenario: 用户请求长期计划
- **WHEN** 用户提出长期训练计划需求，并且意图为 `plan`
- **THEN** 系统 MUST 生成 `kind = "plan"` 的长期计划草稿
- **AND** 计划草稿 MUST 包含 `title`、`goal`、`summary`、`cycleLengthDays`、`trainingDayCount`、`restDayCount`、`estimatedSessionMinutes`、`cycleRepeatable`、`progression`、`recoveryStrategy`、`schedulePattern`、`days` 和 `safetyNotes`
- **AND** `days.length` MUST 与 `cycleLengthDays` 一致
- **AND** 非休息训练日数量 MUST 与 `trainingDayCount` 一致

#### Scenario: 用户要求 6 天计划
- **WHEN** 用户要求“计划 6 天的动作”或“安排 6 天训练计划”
- **THEN** 系统 MUST 将该需求解释为 `cycleLengthDays = 6`
- **AND** 系统 MUST NOT 仅因为出现“6 天”就设置为 `weeklyFrequency = 6`
- **AND** 系统 MUST 允许计划中包含训练日和休息/恢复日

#### Scenario: 计划存在多个训练日
- **WHEN** 长期计划草稿包含多个训练日
- **THEN** 每个训练日 MUST 具备可区分的 `dayType`、`focus` 或动作组合
- **AND** 系统 MUST NOT 只生成多份名称不同但动作结构高度相同的训练日

### Requirement: 计划周期语义不得与周频率或日历范围混淆
系统 SHALL 区分计划周期天数、每周训练频率和具体日历导入范围，避免把用户的自然语言时间表达错误映射到同一个字段。

#### Scenario: 用户要求每周 6 练
- **WHEN** 用户明确说“每周 6 练”或“一周练 6 天”
- **THEN** 系统 MUST 将该需求解释为周训练频率
- **AND** 系统 MUST 仍然为长期计划生成可重复的周期结构

#### Scenario: 用户要求未来 6 天每天练
- **WHEN** 用户明确说“未来 6 天每天练”
- **THEN** 系统 MUST 将该需求解释为具体日历范围
- **AND** 系统 MUST 记录可用于导入日历的 `calendarHorizonDays = 6`
- **AND** 系统 MUST NOT 将它等同于普通的 6 天周期模板

### Requirement: 长期计划训练日必须同步三段式编排
系统 SHALL 将长期计划中的每个训练日表达为 `warmup`、`training`、`stretch` 三段式训练结构，并与单次 routine 使用同一套 section 语义。

#### Scenario: 系统生成训练日
- **WHEN** 系统生成长期计划中的任意非休息训练日
- **THEN** 该训练日 MUST 包含 `sections`
- **AND** `sections` MUST 同时包含 `warmup`、`training` 和 `stretch`
- **AND** 每个 section MUST 至少包含 1 个动作

#### Scenario: 系统生成休息日
- **WHEN** 系统在长期计划周期内生成休息或恢复日
- **THEN** 该日期 MUST 标记为 `isRestDay = true`
- **AND** 该日期 MUST 包含恢复说明或安全提示
- **AND** 系统 MUST NOT 为休息日创建训练动作 routine

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

### Requirement: 计划卡片必须展示计划周期和三段式训练日
聊天中的长期计划推送卡片 SHALL 同时展示计划周期摘要、训练日分工、三段式动作内容和按周期导入预期。

#### Scenario: 用户查看长期计划卡片
- **WHEN** 聊天流展示长期计划草稿卡片
- **THEN** 卡片 MUST 展示计划标题、目标、周期天数、训练日数量、休息日数量、单次预估时长、递进说明和恢复策略
- **AND** 卡片 MUST 展示周期日序列或切换入口，并让用户看到每个周期日的 `dayType`、`focus` 和是否休息

#### Scenario: 用户查看某个训练日
- **WHEN** 用户选中长期计划卡片中的任意训练日
- **THEN** 卡片 MUST 按 `warmup`、`training`、`stretch` 展示当天动作
- **AND** 卡片 MUST 展示该训练日的预估时长、安全提示和训练重点

#### Scenario: 用户查看休息日
- **WHEN** 用户选中长期计划卡片中的休息日
- **THEN** 卡片 MUST 展示恢复说明、活动建议或安全提示
- **AND** 卡片 MUST NOT 展示空训练动作列表作为异常状态

### Requirement: 计划导入必须保留三段式 section
系统 SHALL 在保存长期计划时将每个训练日转换为独立 `WorkoutRoutine`，并保留训练日内每个动作的 section。

#### Scenario: 用户导入长期计划
- **WHEN** 用户确认导入长期计划
- **THEN** 系统 MUST 为每个非休息训练日创建一个 `WorkoutRoutine`
- **AND** 转换后的 `WorkoutRoutine.items` MUST 按 `warmup`、`training`、`stretch` 顺序保存
- **AND** 每个 `WorkoutRoutineItem.section` MUST 保留草稿中的 section

#### Scenario: 用户从导入计划进入训练
- **WHEN** 用户打开由长期计划导入生成的训练安排
- **THEN** 训练执行时间线 MUST 能读取 warmup、training 和 stretch 动作
- **AND** 主训练循环 MUST 只作用于 training section

### Requirement: 计划导入必须按周期生成日程
系统 SHALL 根据长期计划的周期长度和用户选择的重复周期数生成训练日与休息日 schedule，而不是固定提供未来 1 周或未来 4 周导入。

#### Scenario: 用户选择导入本周期
- **WHEN** 用户在长期计划卡片中选择导入本周期
- **THEN** 系统 MUST 按 `cycleLengthDays` 生成一个完整周期的 `WorkoutSchedule`
- **AND** 非休息训练日 MUST 按计划草稿中的周期日序创建训练安排
- **AND** 休息日 MUST 生成 `status = "rest"` 的休息安排

#### Scenario: 用户选择重复周期
- **WHEN** 用户在长期计划卡片中选择重复 2 个周期或重复 4 个周期
- **THEN** 系统 MUST 生成 `cycleLengthDays * repeatCount` 天的 `WorkoutSchedule`
- **AND** 每个周期 MUST 按同一周期日序重复训练日和休息日

#### Scenario: 用户有明确日历范围
- **WHEN** 用户意图中包含明确 `calendarHorizonDays`
- **THEN** 系统 MUST 只在存在明确日历范围时展示按用户指定日期范围导入的选项
- **AND** 该选项 MUST 以周期日序循环填充指定日期范围

#### Scenario: 计划被重复导入
- **WHEN** 用户再次导入同一长期计划
- **THEN** 系统 MUST 只替换导入区间内同一 `sourceRoutineTitle` 的旧安排
- **AND** 系统 MUST NOT 删除用户手动创建或其他计划来源的 schedule

### Requirement: 经验未明确时长期计划必须默认推送简单计划

当用户提出长期、每周、多天或周期性训练计划需求，并且目标、单次时长、频率、器械或场地条件已经足够时，系统 SHALL 在经验未明确时默认按简单/新手友好的方式触发 `workout_plan`。

#### Scenario: 用户补充无器械完成计划条件

- **WHEN** 对话上下文已经包含长期计划需求、训练目标、单次训练时长和每周频率
- **AND** 用户补充“我没有器械”或等价的无器械条件
- **AND** 意图解析结果为 `workout_plan` 或根据上下文可继续长期计划生成
- **AND** `missingActionFields` 包含 `experience`
- **AND** 动作候选状态为 `enough` 或 `limited_but_usable`
- **THEN** 系统 MUST 触发 `workout_plan` 内部动作事件
- **AND** 生成结果 MUST 使用简单/新手友好的周期安排、动作选择和训练量

#### Scenario: 核心计划条件不足仍需追问

- **WHEN** 用户提出长期计划需求
- **AND** 目标、单次时长、每周频率、器械或场地等核心条件仍有缺失
- **THEN** 系统 MUST 继续追问缺失的核心训练条件
- **AND** 系统 MUST NOT 仅凭默认经验触发 `workout_plan`

### Requirement: 长期计划校验失败必须可恢复

聊天推送长期 plan 时，系统 SHALL 将可调整的服务端校验失败转成自动修复或继续对话引导。

#### Scenario: 计划训练日时长超出

- **WHEN** AI 生成的长期计划草稿中某个训练日估算时长超过用户目标时长
- **THEN** 系统 MUST 先尝试自动压缩该计划并重新校验
- **AND** 系统 MUST NOT 展示未通过校验的计划卡片

#### Scenario: 周频率或训练日结构需要调整

- **WHEN** 长期计划草稿的周频率、训练日数量或恢复安排与用户意图不一致
- **THEN** 系统 MUST 优先尝试自动修复
- **AND** 修复失败时系统 MUST 引导用户确认训练频率、周期长度或是否保留完整训练量

### Requirement: 生成后建议不得默认改变用户明确需求
系统 SHALL 在完成用户明确可执行需求后，以用户可选择的方式提供更稳妥训练调整建议。

#### Scenario: 用户明确请求可执行长期计划
- **WHEN** 用户明确请求长期、多天或周期性训练安排
- **AND** resolved intent 具备生成条件
- **THEN** 系统 MUST 优先生成符合用户请求的计划
- **AND** 系统 MAY 在回复中提供调整建议或建议按钮
- **AND** 系统 MUST NOT 在没有硬阻断的情况下私自把用户请求改成另一种计划目标

#### Scenario: 存在硬阻断条件
- **WHEN** 用户请求涉及医疗诊断、治疗建议、不可执行引用对象或缺少必要训练条件
- **THEN** 系统 MUST 阻断生成或进入澄清
- **AND** 系统 MUST 用用户可理解的方式说明需要补充或无法执行的原因

### Requirement: 长期计划推送必须服从 Agent 执行结果
系统 SHALL 让长期计划推送服从 Tool-first Agent 的结构化结果。长期计划生成请求 MUST 来自 Agent 已登记的 plan draft / edit plan / candidate set / validation / policy 输入，而不是旧 resolved intent。

#### Scenario: Agent 要求生成长期计划
- **WHEN** `AgentExecutionResult` 或 Agent tool result 表示本轮应生成长期计划
- **THEN** 长期计划生成流程 MUST 使用 Agent 提供的结构化计划输入、candidateSetId、用户约束、字段来源和 tool result ids
- **AND** 系统 MUST NOT 从旧 `workoutIntent`、`action.kind` 或回复正文重新判断是否生成 plan

#### Scenario: Agent 要求澄清或阻断
- **WHEN** Agent 返回 `needs_clarification`、`blocked` 或 `failed`
- **THEN** 系统 MUST NOT 调用长期计划生成流程
- **AND** 前端 MUST NOT 展示长期计划生成中的加载状态

#### Scenario: 计划草稿与 Agent 输入冲突
- **WHEN** 计划草稿的周期、周频、训练日数量、时长或器械条件与 Agent 结构化输入冲突
- **THEN** 系统 MUST 拒绝将该草稿作为成功计划返回
- **AND** 系统 MUST 进入 Agent failure handling、重新校验、重新生成或澄清路径

