## MODIFIED Requirements

### Requirement: Workout routine persistence
系统 SHALL 使用 `WorkoutRoutine` 保存用户可复用的动作编排列表，并使用 `WorkoutRoutineItem` 保存该编排列表中的动作项。

#### Scenario: User saves a custom routine
- **WHEN** 用户在动作编排页保存一套动作编排
- **THEN** 系统 MUST 创建或更新一个归属于当前用户的 `WorkoutRoutine`
- **AND** 系统 MUST 将编排中的动作按顺序保存为 `WorkoutRoutineItem`
- **AND** 每个 `WorkoutRoutineItem` MUST 保存 `exerciseId`、`mode`、`target`、`sets`、`setRestSeconds`、`transitionRestSeconds`、`section` 和 `sortOrder`
- **AND** 系统 MUST NOT 为单次动作编排创建 `WorkoutPlanDay` 或等价的训练日中间层

#### Scenario: AI routine draft is saved as workout routine
- **WHEN** 用户保存聊天页面推送的 AI 单次训练编排
- **THEN** 系统 MUST 创建一个归属于当前用户的 `WorkoutRoutine`
- **AND** 系统 MUST 保存 AI 草稿中的 `trainingLoopRounds` 和 `trainingLoopRestSeconds`
- **AND** 系统 MUST 将热身、训练、拉伸三个 section 中的动作按展示顺序保存为 `WorkoutRoutineItem`
- **AND** 每个保存后的 `WorkoutRoutineItem.section` MUST 与 AI 草稿中的 section 一致
- **AND** 系统 MUST NOT 将 AI routine 草稿降级保存为所有动作都属于 `training`

#### Scenario: Routine item references exercise library
- **WHEN** 系统保存 `WorkoutRoutineItem`
- **THEN** `exerciseId` MUST 引用数据库中已存在的 `Exercise.id`
- **AND** 系统 MUST 拒绝保存不存在的 `exerciseId`
- **AND** 系统 MUST NOT 将未经校验的 AI 或客户端动作 id 直接持久化为可执行动作

#### Scenario: User lists routines
- **WHEN** 用户打开动作编排页或训练日历页需要选择编排
- **THEN** 系统 MUST 只返回当前用户未归档的 `WorkoutRoutine`
- **AND** 返回结构 MUST 包含可执行时间线所需的 routine items、循环轮数、循环间休息和动作展示信息

#### Scenario: Routine is edited after being scheduled
- **WHEN** 用户修改已被日历安排引用的 `WorkoutRoutine`
- **THEN** 系统 MUST 更新 routine 当前定义
- **AND** 系统 MUST 保留已存在 `WorkoutSchedule` 的展示快照，避免历史日历标题、预估分钟或预估热量被意外改写

#### Scenario: Legacy workout API is removed
- **WHEN** 本 change 实现完成
- **THEN** 前端和测试 MUST 使用 routine 命名的 API、类型和服务函数
- **AND** 系统 MUST NOT 保留 `SavedWorkout` 作为持久化类型别名
- **AND** 系统 MUST NOT 保留 `/api/workouts` 作为动作编排的兼容入口
