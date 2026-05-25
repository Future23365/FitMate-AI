## MODIFIED Requirements

### Requirement: Timeline-ordered session progression
系统 SHALL 在 `/training` 使用 `buildWorkoutTimeline()` 生成的线性步骤顺序作为训练推进、手动跳步和完成状态的唯一依据，并且 SHALL 在用户显式点击开始前保持训练待开始状态。

#### Scenario: User enters training session
- **WHEN** 用户打开 `/training` 并且训练计划加载完成
- **THEN** 系统 MUST 展示时间线中的当前步骤和训练信息
- **AND** 系统 MUST NOT 自动开始准备倒计时、训练计时、计次、beep 或步骤推进
- **AND** 系统 MUST 提供明确的“开始”操作

#### Scenario: User starts training
- **WHEN** 用户点击训练执行页的“开始”控制
- **THEN** 系统 MUST 从当前时间线步骤开始训练流程
- **AND** 如果当前步骤是动作步骤，系统 MUST 进入准备倒计时或等待动作准备语音完成后的准备倒计时
- **AND** 如果当前步骤是休息步骤，系统 MUST 开始休息倒计时

#### Scenario: User changes step before starting
- **WHEN** 用户在待开始状态点击上一个、下一个、跳过休息，或从训练项目列表选择动作
- **THEN** 系统 MUST 更新当前 `activeStepIndex`、剩余时长、示范图和当前步骤信息
- **AND** 系统 MUST 保持待开始状态，不自动启动倒计时或训练计时

#### Scenario: Timer completes current step
- **WHEN** 当前训练步骤倒计时归零且训练已经开始
- **THEN** 系统 MUST 进入时间线中的下一个步骤
- **AND** 系统 MUST 根据下一个步骤类型重置剩余时长、准备倒计时、示范图和语音播报状态

#### Scenario: User clicks next control after starting
- **WHEN** 用户在训练已经开始后点击训练执行页的“下一个”控制
- **THEN** 系统 MUST 进入当前 `activeStepIndex` 后面的下一个时间线步骤
- **AND** 系统 MUST NOT 使用动作 `id` 或动作名称反推下一个步骤

#### Scenario: User reaches last step
- **WHEN** 当前步骤已经是时间线最后一步且用户触发完成当前步骤
- **THEN** 系统 MUST 停止训练推进
- **AND** 系统 MUST 保留用户显式结束训练或返回的能力
