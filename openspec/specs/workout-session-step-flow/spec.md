# workout-session-step-flow Specification

## Purpose
TBD - created by archiving change fix-workout-session-step-flow. Update Purpose after archive.
## Requirements
### Requirement: Timeline-ordered session progression
系统 SHALL 在 `/training` 使用显式 `planId` 对应的训练安排和 `buildWorkoutTimeline()` 生成的线性步骤顺序作为训练推进、手动跳步和完成状态的唯一依据，并且 SHALL 保证持久化完成状态不影响当前前端训练执行流程。

#### Scenario: User opens training without plan id
- **WHEN** 用户打开 `/training` 且 URL 缺少 `planId`
- **THEN** 系统 MUST NOT 自动选择默认训练、planned 训练或 fallback 训练
- **AND** 系统 MUST 展示缺少训练安排的错误状态和返回训练计划页的入口
- **AND** 系统 MUST NOT 启动训练倒计时、步骤推进或语音播报

#### Scenario: User opens training with plan id
- **WHEN** 用户打开 `/training?planId=<id>`
- **THEN** 系统 MUST 加载该 `planId` 对应的训练安排
- **AND** 系统 MUST 使用该训练安排生成训练时间线
- **AND** 系统 MUST NOT 使用其他 planned 训练或 fallback 训练替代

#### Scenario: Completed workout opens again
- **WHEN** 用户打开 `/training?planId=<id>` 且该训练安排状态为 `completed`
- **THEN** 系统 MUST 仍然展示当前前端训练的待开始状态和“开始”控制
- **AND** 系统 MUST NOT 因为持久化状态为 `completed` 而显示暂停控制、跳过开始状态或阻止训练执行

#### Scenario: User starts a completed workout again
- **WHEN** 用户在已完成训练安排的训练执行页点击“开始”
- **THEN** 系统 MUST 从当前时间线步骤开始本次前端训练流程
- **AND** 系统 MUST 按当前页面的 `hasStarted`、`isPaused`、步骤索引和倒计时推进训练
- **AND** 系统 MUST NOT 使用持久化 `completed` 状态阻止准备倒计时、计时、计次、beep 或语音播报

#### Scenario: Timer completes current step
- **WHEN** 当前训练步骤倒计时归零且训练已经开始
- **THEN** 系统 MUST 进入时间线中的下一个步骤
- **AND** 系统 MUST 根据下一个步骤类型重置剩余时长、准备倒计时、示范图和语音播报状态

#### Scenario: User clicks next control after starting
- **WHEN** 用户在训练已经开始后点击训练执行页的“下一个”控制
- **THEN** 系统 MUST 进入当前 `activeStepIndex` 后面的下一个时间线步骤
- **AND** 系统 MUST NOT 使用动作 `id`、动作名称、计划状态或完成状态反推下一个步骤

#### Scenario: User reaches last step
- **WHEN** 当前步骤已经是时间线最后一步且用户触发完成当前步骤
- **THEN** 系统 MUST 停止训练推进
- **AND** 系统 MUST 保留用户显式结束训练、重新开始或返回的能力

### Requirement: Loop-aware workout item list
系统 SHALL 在训练项目列表中区分循环训练的重复动作，并准确反映当前时间线位置。

#### Scenario: Workout has multiple training loop rounds
- **WHEN** 当前训练计划的 `trainingLoopRounds` 大于 1
- **THEN** 训练项目列表 MUST 为主训练区重复动作展示所属循环轮次
- **AND** 同一个动作在不同轮次中 MUST 作为不同列表项展示

#### Scenario: Workout has one training loop round
- **WHEN** 当前训练计划的 `trainingLoopRounds` 等于 1
- **THEN** 训练项目列表 MAY 不展示循环轮次标识
- **AND** 列表仍 MUST 使用时间线顺序判断当前项和完成状态

#### Scenario: Active exercise is duplicated in loops
- **WHEN** 当前动作在多轮循环中重复出现
- **THEN** 训练项目列表 MUST 高亮当前时间线步骤对应的那一个轮次项
- **AND** 系统 MUST NOT 高亮同 `id` 的首个重复动作作为替代

#### Scenario: Active rest points to duplicated next exercise
- **WHEN** 当前步骤是休息，并且下一个动作是多轮循环中的重复动作
- **THEN** 训练项目列表 MUST 高亮或预告时间线中紧随休息后的那一个轮次项
- **AND** “下一个动作”展示 MUST 与时间线中的下一步保持一致

#### Scenario: User selects a list item
- **WHEN** 用户点击训练项目列表中的某个动作
- **THEN** 系统 MUST 跳转到该列表项对应的第一个未完成动作步骤
- **AND** 如果该列表项所有组都已完成，系统 MUST 跳转到该列表项的第一个动作步骤

### Requirement: Rest skip control
系统 SHALL 在休息步骤提供明确的“跳过休息”操作，用于进入时间线中的下一步。

#### Scenario: Current step is rest
- **WHEN** 当前时间线步骤类型是 `rest`
- **THEN** 训练执行页 MUST 显示“跳过休息”按钮
- **AND** 按钮 MUST 比通用跳步入口更明确地表达只跳过当前休息

#### Scenario: User skips rest
- **WHEN** 用户点击“跳过休息”
- **THEN** 系统 MUST 进入当前休息步骤后的下一个时间线步骤
- **AND** 系统 MUST 重置新步骤的剩余时长、准备倒计时、示范图和语音播报状态

#### Scenario: Current step is exercise
- **WHEN** 当前时间线步骤类型是 `exercise`
- **THEN** 系统 MUST NOT 将主操作文案显示为“跳过休息”
- **AND** 现有动作步骤的暂停、继续、上一个、下一个能力 MUST 保持可用

### Requirement: Step selection cancels stale step work
系统 SHALL 在用户手动切换步骤时清理旧步骤的异步推进，避免旧倒计时或语音回调影响新步骤。

#### Scenario: User moves to another step
- **WHEN** 用户点击上一个、下一个、跳过休息，或从训练项目列表选择动作
- **THEN** 系统 MUST 取消或忽略旧步骤的准备倒计时、语音播报和节奏提示回调
- **AND** 新步骤 MUST 按自身类型重新进入准备、训练或休息状态

#### Scenario: Stale callback arrives after step change
- **WHEN** 旧步骤的倒计时、语音或计次回调在步骤切换后返回
- **THEN** 系统 MUST NOT 用该回调推进当前步骤
- **AND** 系统 MUST NOT 覆盖当前步骤的剩余时长、准备状态或语音状态

### Requirement: Local workout completion presentation
系统 SHALL 在 `/training` 使用当前页面会话状态展示训练完成态，并且该完成态 SHALL 与服务端是否成功记录训练安排为 `completed` 解耦。

#### Scenario: User completes the final timeline step
- **WHEN** 用户完成当前训练时间线中的最后一步
- **THEN** 系统 MUST 在中心展示区显示“恭喜，已完成本次训练”
- **AND** 系统 MUST 在中心展示区播放从底部向上喷出的五彩纸屑欢呼动画
- **AND** 系统 MUST 隐藏“上一个”“开始”“暂停”“继续”“下一个”“跳过休息”等运行中控制
- **AND** 系统 MUST 隐藏当前动作计时、计次、准备中和下一个动作等运行中文案

#### Scenario: Server completion update fails
- **WHEN** 用户完成当前训练时间线中的最后一步，但服务端完成状态记录失败
- **THEN** 系统 MUST 继续显示本次页面会话完成态
- **AND** 系统 MUST NOT 因服务端记录失败而回到运行中、暂停或待开始状态

#### Scenario: Completed persisted workout opens again
- **WHEN** 用户打开 `/training?planId=<id>` 且该训练安排服务端状态为 `completed`
- **THEN** 系统 MUST 仍然展示当前页面训练的待开始状态
- **AND** 系统 MUST NOT 仅因为服务端状态为 `completed` 显示本地完成态

#### Scenario: User changes step after local completion
- **WHEN** 当前页面处于本地完成态，且用户从训练项目列表选择某个动作步骤
- **THEN** 系统 MUST 退出本地完成态
- **AND** 系统 MUST 按所选时间线步骤恢复当前页面训练展示

### Requirement: Independent elapsed workout timer
系统 SHALL 在 `/training` 使用独立于当前步骤倒计时的总训练计时器显示“已训练”时长，并且该总时长 SHALL 包含动作时间、休息时间和训练开始后的准备等待时间。

#### Scenario: Training starts
- **WHEN** 用户点击“开始”并进入训练执行流程
- **THEN** “已训练”总时长 MUST 从 0 开始使用独立计时器累加
- **AND** 当前步骤倒计时 MUST 继续只负责当前动作或休息步骤的剩余时间

#### Scenario: Rest step is active
- **WHEN** 当前时间线步骤是休息步骤且用户没有手动暂停训练
- **THEN** 休息倒计时 MUST 继续推进
- **AND** “已训练”总时长 MUST 同时继续累加休息经过的时间

#### Scenario: Exercise preparation is active
- **WHEN** 当前动作正在等待准备提示或准备倒计时
- **THEN** 当前动作步骤倒计时 MAY 等待准备完成后再推进
- **AND** “已训练”总时长 MUST 继续累加训练开始后经过的时间

#### Scenario: Workout flow is paused by detail drawer
- **WHEN** 用户打开动作详情抽屉导致训练流程暂停
- **THEN** 当前动作、休息或准备倒计时 MUST 停止推进
- **AND** “已训练”总时长 MUST NOT 因该非手动暂停状态停止累加

#### Scenario: User manually pauses workout
- **WHEN** 用户点击训练执行页的“暂停”控制
- **THEN** 当前训练流程 MUST 暂停
- **AND** “已训练”总时长 MUST 暂停累加

#### Scenario: User manually resumes workout
- **WHEN** 用户点击训练执行页的“继续”控制
- **THEN** 当前训练流程 MUST 恢复
- **AND** “已训练”总时长 MUST 继续从暂停前数值累加

#### Scenario: Workout session resets
- **WHEN** 用户加载新的训练安排、缺少训练安排参数，或训练页面重置为待开始状态
- **THEN** “已训练”总时长 MUST 重置为 0
- **AND** 手动暂停计时状态 MUST 重置为未暂停

