## ADDED Requirements

### Requirement: 明确时长的本次训练请求必须触发 routine

当用户提供训练目标、单次训练时长，并说明器械或场地条件时，聊天意图解析 SHALL 将该请求表达为单次训练编排 `routine`，不得把顶层 `type` 表达为 `exercise_recommendation`。

#### Scenario: 用户提供目标时长和器械条件

- **WHEN** 用户输入“练腿，20分钟，没有器械”
- **THEN** 意图解析结果 MUST 使用顶层 `type = "routine"`
- **AND** `workoutIntent.intentType` MUST 为 `routine`
- **AND** `canTriggerAction` MUST 为 `true`
- **AND** 系统 MUST 触发 `workout_routine` 内部动作事件

#### Scenario: 动作推荐请求没有本次训练编排语义

- **WHEN** 用户只要求推荐某类动作，例如“推荐几个练腿动作”
- **THEN** 意图解析结果 MAY 使用顶层 `type = "exercise_recommendation"`
- **AND** 系统 MUST NOT 因为目标部位存在而强制触发 `workout_routine`

### Requirement: 聊天意图解析不得返回互相冲突的动作类型

聊天意图解析 SHALL 让顶层 `type` 与 `workoutIntent.intentType` 表达一致的用户意图，避免同一次回复同时表达动作推荐和单次训练编排。

#### Scenario: 顶层类型和训练意图冲突

- **WHEN** 用户请求已经满足单次训练编排条件
- **THEN** 意图解析结果 MUST NOT 返回顶层 `type = "exercise_recommendation"` 且 `workoutIntent.intentType = "routine"` 的混合语义作为最终意图
