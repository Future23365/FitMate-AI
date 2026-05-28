## ADDED Requirements

### Requirement: Workout routine section rest persistence
系统 SHALL 将阶段间休息作为 `WorkoutRoutine` 的可执行配置保存，并在读取 routine 时返回该配置。

#### Scenario: User saves section rest in routine
- **WHEN** 用户在动作编排页配置热身到训练或训练到拉伸之间的休息时长并保存编排
- **THEN** 系统 MUST 将热身到训练休息和训练到拉伸休息保存到该 `WorkoutRoutine`
- **AND** 系统 MUST 在后续读取该 routine 时返回相同配置
- **AND** 系统 MUST NOT 将阶段间休息混写为某个动作的 `transitionRestSeconds`

#### Scenario: Existing routine has no section rest
- **WHEN** 系统读取缺少阶段间休息字段的历史 `WorkoutRoutine`
- **THEN** 系统 MUST 使用默认阶段间休息配置归一化返回结构
- **AND** 系统 MUST 保证该 routine 仍可保存、排期和执行
