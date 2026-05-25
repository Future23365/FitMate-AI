## MODIFIED Requirements

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
