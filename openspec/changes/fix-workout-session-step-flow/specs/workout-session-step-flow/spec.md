## ADDED Requirements

### Requirement: Timeline-ordered session progression
系统 SHALL 在 `/training` 使用 `buildWorkoutTimeline()` 生成的线性步骤顺序作为训练推进、手动跳步和完成状态的唯一依据。

#### Scenario: Timer completes current step
- **WHEN** 当前训练步骤倒计时归零
- **THEN** 系统 MUST 进入时间线中的下一个步骤
- **AND** 系统 MUST 根据下一个步骤类型重置剩余时长、准备倒计时、示范图和语音播报状态

#### Scenario: User clicks next control
- **WHEN** 用户点击训练执行页的“下一个”控制
- **THEN** 系统 MUST 进入当前 `activeStepIndex` 后面的下一个时间线步骤
- **AND** 系统 MUST NOT 使用动作 `id` 或动作名称反推下一个步骤

#### Scenario: User reaches last step
- **WHEN** 当前步骤已经是时间线最后一步且用户触发完成当前步骤
- **THEN** 系统 MUST 停止训练推进
- **AND** 系统 MUST 保留用户显式结束训练或返回的能力

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
