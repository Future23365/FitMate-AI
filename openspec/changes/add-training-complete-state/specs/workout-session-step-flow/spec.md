## ADDED Requirements

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
