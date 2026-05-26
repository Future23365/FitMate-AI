## ADDED Requirements

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
