## ADDED Requirements

### Requirement: Section boundary rest in workout timeline
系统 SHALL 在训练时间线中使用 routine 的阶段间休息配置表达热身到训练、训练到拉伸之间的休息。

#### Scenario: Timeline reaches warmup to training boundary
- **WHEN** 当前 routine 同时包含热身动作和训练动作，且热身到训练休息时长大于 0
- **THEN** `buildWorkoutTimeline()` MUST 在最后一个热身动作后、第一个训练动作前插入休息步骤
- **AND** 该休息步骤 MUST 使用热身到训练休息时长
- **AND** 该休息步骤 MUST NOT 使用最后一个热身动作的动作间休息替代

#### Scenario: Timeline reaches training to stretch boundary
- **WHEN** 当前 routine 同时包含训练动作和拉伸动作，且训练到拉伸休息时长大于 0
- **THEN** `buildWorkoutTimeline()` MUST 在最后一轮训练动作后、第一个拉伸动作前插入休息步骤
- **AND** 该休息步骤 MUST 使用训练到拉伸休息时长
- **AND** 该休息步骤 MUST NOT 使用最后一个训练动作的动作间休息替代

#### Scenario: Section boundary is missing one side
- **WHEN** 热身、训练或拉伸中任一相邻阶段没有动作
- **THEN** `buildWorkoutTimeline()` MUST NOT 为缺失阶段的一侧插入阶段间休息
