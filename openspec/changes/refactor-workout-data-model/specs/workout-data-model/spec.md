## ADDED Requirements

### Requirement: Workout routine persistence
系统 SHALL 使用 `WorkoutRoutine` 保存用户可复用的动作编排列表，并使用 `WorkoutRoutineItem` 保存该编排列表中的动作项。

#### Scenario: User saves a custom routine
- **WHEN** 用户在动作编排页保存一套动作编排
- **THEN** 系统 MUST 创建或更新一个归属于当前用户的 `WorkoutRoutine`
- **AND** 系统 MUST 将编排中的动作按顺序保存为 `WorkoutRoutineItem`
- **AND** 每个 `WorkoutRoutineItem` MUST 保存 `exerciseId`、`mode`、`target`、`sets`、`setRestSeconds`、`transitionRestSeconds`、`section` 和 `sortOrder`
- **AND** 系统 MUST NOT 为单次动作编排创建 `WorkoutPlanDay` 或等价的训练日中间层

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

### Requirement: Workout schedule persistence
系统 SHALL 使用 `WorkoutSchedule` 保存日历上某一天安排哪套编排或休息日。

#### Scenario: User schedules a routine
- **WHEN** 用户在训练日历页把一套 `WorkoutRoutine` 安排到指定日期
- **THEN** 系统 MUST 创建一个 `WorkoutSchedule`
- **AND** `WorkoutSchedule.routineId` MUST 指向该 `WorkoutRoutine`
- **AND** `WorkoutSchedule.scheduledFor` MUST 保存被安排的日期
- **AND** `WorkoutSchedule.status` MUST 初始为 `planned`，除非用户显式选择其他有效状态
- **AND** 系统 MUST 保存标题、预估分钟和预估热量的展示快照

#### Scenario: User creates a rest day
- **WHEN** 用户在训练日历页把某一天设置为休息日
- **THEN** 系统 MUST 创建一个 `WorkoutSchedule`，其 `status` 为 `rest`
- **AND** 该记录 MAY 不关联 `WorkoutRoutine`
- **AND** 系统 MUST NOT 创建空 routine 来表示休息日

#### Scenario: AI draft is saved with calendar schedule
- **WHEN** 用户保存 AI 生成的多日训练草稿并选择生成日历安排
- **THEN** 系统 MUST 将草稿中的每个可训练日保存为独立 `WorkoutRoutine`
- **AND** 系统 MUST 为目标日期范围创建指向对应 routine 的 `WorkoutSchedule`
- **AND** 草稿中的休息日 MUST 保存为 `status = rest` 的 `WorkoutSchedule`
- **AND** 系统 MUST NOT 创建长期存在的 `WorkoutPlan`、`Program` 或等价计划外壳表

#### Scenario: Schedule status changes
- **WHEN** 用户在训练日历页将某条安排标记为 `planned`、`missed`、`completed`、`cancelled` 或 `rest`
- **THEN** 系统 MUST 只更新当前用户拥有的 `WorkoutSchedule`
- **AND** 系统 MUST 保持状态枚举与日历筛选、月度统计和卡片徽标一致

#### Scenario: Legacy schedule API is removed
- **WHEN** 本 change 实现完成
- **THEN** 前端和测试 MUST 使用 schedule 命名的 API、类型和服务函数
- **AND** 系统 MUST NOT 保留 `ScheduledWorkout` 作为持久化类型别名
- **AND** 系统 MUST NOT 保留 `/api/workout-sessions` 作为日历安排的兼容入口
- **AND** 训练执行页 MUST 使用 `scheduleId` 表达当前训练安排 id

### Requirement: Workout session result persistence
系统 SHALL 使用 `WorkoutSessionResult` 保存用户实际执行一次训练后的结果摘要。

#### Scenario: User completes a scheduled workout
- **WHEN** 用户在 `/training` 完成一条 `WorkoutSchedule` 对应训练的最后一个时间线步骤
- **THEN** 系统 MUST 创建或更新一个关联该 schedule 的 `WorkoutSessionResult`
- **AND** 结果 MUST 至少保存 `startedAt`、`endedAt`、`durationSeconds`、完成状态和本次执行摘要
- **AND** 系统 MUST 同步将对应 `WorkoutSchedule.status` 更新为 `completed`

#### Scenario: Completion result includes actual session summary
- **WHEN** 训练执行页提交完成结果
- **THEN** 请求体 MUST 支持传入实际训练秒数、完成步骤数、总步骤数、完成动作数、总动作数和估算热量
- **AND** 服务端 MUST 校验这些数值为非负整数或有效数值
- **AND** 服务端 MUST NOT 只用当前时间同时写入 `startedAt` 与 `endedAt` 来伪造训练时长

#### Scenario: Completion result write fails
- **WHEN** 系统无法写入 `WorkoutSessionResult` 或无法更新 `WorkoutSchedule`
- **THEN** 服务端 MUST 返回可识别的错误
- **AND** 前端本地完成态 MUST NOT 因该错误被回滚
- **AND** 错误 MUST 被记录，便于后续定位持久化失败

#### Scenario: Completed schedule is opened again
- **WHEN** 用户再次打开已完成的 `WorkoutSchedule`
- **THEN** 系统 MUST 仍允许用户重新开始当前页面训练流程
- **AND** 系统 MUST NOT 仅因为已有 `WorkoutSessionResult` 就跳过待开始状态

### Requirement: Development data reset
系统 SHALL 允许本次训练数据模型重构以破坏性方式替换旧训练表，并且 SHALL NOT 为未上线开发数据增加兼容迁移复杂度。

#### Scenario: Old workout tables are replaced
- **WHEN** 本 change 修改 Prisma schema
- **THEN** 系统 MUST 删除或停用旧 `WorkoutPlan`、`WorkoutPlanDay`、`WorkoutPlanItem` 和 `WorkoutSession`
- **AND** 系统 MUST 使用 `WorkoutRoutine`、`WorkoutRoutineItem`、`WorkoutSchedule` 和 `WorkoutSessionResult` 作为训练持久化事实表
- **AND** 系统 MUST NOT 为旧训练业务数据编写保留语义的迁移逻辑

#### Scenario: Non-workout data remains scoped
- **WHEN** 执行破坏性训练数据重构
- **THEN** 实现 MUST 明确破坏范围
- **AND** 系统 MUST NOT 无意删除动作库 `Exercise`、用户、聊天历史等不属于训练表重构目标的数据
- **AND** 如果实现选择全库 reset，任务记录 MUST 明确需要重新 seed 动作库

#### Scenario: Old naming is cleaned
- **WHEN** 本 change 实现完成
- **THEN** 业务代码 MUST NOT 继续使用 `WorkoutPlanDay` 表达用户动作编排
- **AND** 持久化层、API client、测试 fixture 和文档 MUST NOT 继续使用旧 `WorkoutPlan` 三层结构描述当前产品模型
