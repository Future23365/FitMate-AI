## ADDED Requirements

### Requirement: Refactor completion gate
系统 SHALL 在 `refactor-workout-data-model` 实现完成后执行独立的训练数据模型重构排查流程，并且 SHALL 在排查完成前不得将该重构视为完成。

#### Scenario: Refactor implementation is ready for audit
- **WHEN** `refactor-workout-data-model` 的实现任务已完成
- **THEN** 系统 MUST 先运行 `openspec validate refactor-workout-data-model --strict`
- **AND** 系统 MUST 确认该 change 的实现任务状态已更新
- **AND** 系统 MUST 进入 `audit-workout-data-model-refactor` 排查流程

#### Scenario: Refactor audit finds blocking issues
- **WHEN** 排查发现 schema、API、服务层、前端调用、测试或构建存在阻断问题
- **THEN** 系统 MUST 先修复阻断问题
- **AND** 系统 MUST 为修复补充对应自动化测试或明确验证记录
- **AND** 系统 MUST NOT 只记录问题而跳过修复

### Requirement: Legacy model residue scan
系统 SHALL 对训练数据模型重构后的源码、测试和当前文档执行旧模型残留扫描。

#### Scenario: Legacy workout names remain in active code
- **WHEN** 当前源码、当前测试或当前数据库说明中仍出现旧持久化语义 `WorkoutPlan`、`WorkoutPlanDay`、`WorkoutPlanItem`、`WorkoutSession`、`SavedWorkout`、`ScheduledWorkout`、`ScheduleStatus`、`planId`、`/api/workouts` 或 `/api/workout-sessions`
- **THEN** 系统 MUST 判断该残留是否属于当前业务语义
- **AND** 如果属于当前业务语义，系统 MUST 将其替换为 routine、schedule 或 session result 语义
- **AND** 系统 MUST NOT 通过保留旧别名来规避命名清理

#### Scenario: Legacy names appear in historical files
- **WHEN** 旧名称只出现在归档 OpenSpec 文档、历史迁移文件或明确描述旧设计背景的文档段落中
- **THEN** 系统 MAY 保留这些历史名称
- **AND** 当前实现说明 MUST 明确新模型才是事实来源

### Requirement: Data model integrity audit
系统 SHALL 验证 `WorkoutRoutine`、`WorkoutRoutineItem`、`WorkoutSchedule` 和 `WorkoutSessionResult` 的数据库关系、权限隔离和状态转换。

#### Scenario: Prisma model is validated
- **WHEN** 排查 Prisma 层
- **THEN** 系统 MUST 运行 `npx prisma validate`
- **AND** 系统 MUST 运行 `npm run db:generate`
- **AND** 如果数据库被 reset 或训练表被重建，系统 MUST 运行 `npm run db:seed` 或说明为什么不需要 seed

#### Scenario: Routine integrity is audited
- **WHEN** 排查 routine 持久化
- **THEN** 系统 MUST 验证每个 `WorkoutRoutineItem` 关联有效 `WorkoutRoutine`
- **AND** 每个非空 `WorkoutRoutineItem.exerciseId` MUST 引用有效 `Exercise`
- **AND** 同一 routine 内 `sortOrder` MUST 不重复

#### Scenario: Schedule integrity is audited
- **WHEN** 排查 schedule 持久化
- **THEN** 普通训练 `WorkoutSchedule` MUST 关联有效 `WorkoutRoutine`
- **AND** 休息日 `WorkoutSchedule` MUST NOT 依赖空 routine
- **AND** schedule 展示快照 MUST 足够支撑训练日历列表、月度统计和训练页加载

#### Scenario: Session result integrity is audited
- **WHEN** 排查训练完成结果
- **THEN** 每个 `WorkoutSessionResult` MUST 关联当前用户拥有的 `WorkoutSchedule`
- **AND** 完成 result 写入 MUST 与 `WorkoutSchedule.status = completed` 保持一致
- **AND** `durationSeconds`、步骤数、动作数和热量字段 MUST 经过服务端校验

### Requirement: Workflow regression audit
系统 SHALL 覆盖动作编排、训练日历、AI 草稿保存和训练执行四条主业务链路。

#### Scenario: Composer routine workflow is audited
- **WHEN** 排查动作编排页链路
- **THEN** 系统 MUST 验证新建、复制、保存、读取、更新和删除 routine 的前后端调用
- **AND** 系统 MUST 验证 routine item 的动作顺序、训练参数和分区可被正确保存和读取

#### Scenario: Calendar schedule workflow is audited
- **WHEN** 排查训练日历页链路
- **THEN** 系统 MUST 验证 routine 可被安排到指定日期
- **AND** 系统 MUST 验证休息日、planned、completed、missed、cancelled 状态在列表、日历格和月度统计中一致

#### Scenario: AI draft save workflow is audited
- **WHEN** 排查 AI 草稿保存链路
- **THEN** 系统 MUST 验证多日草稿保存为多个 `WorkoutRoutine`
- **AND** 如果用户选择排期，系统 MUST 验证生成多个 `WorkoutSchedule`
- **AND** 系统 MUST 验证不会创建计划外壳或旧 `WorkoutPlanDay`

#### Scenario: Training execution workflow is audited
- **WHEN** 排查 `/training?scheduleId=<id>` 链路
- **THEN** 系统 MUST 验证训练页按 schedule 加载 routine
- **AND** 系统 MUST 验证训练时间线、倒计时、计次、休息和完成态仍按当前前端状态工作
- **AND** 系统 MUST 验证完成训练时写入 `WorkoutSessionResult`
- **AND** 系统 MUST 验证 result 写入失败不会回滚本地完成态

### Requirement: Audit report
系统 SHALL 在排查完成后输出可追踪的排查报告。

#### Scenario: Audit completes
- **WHEN** 所有排查项完成
- **THEN** 最终说明 MUST 列出执行过的命令及结果
- **AND** 最终说明 MUST 列出发现的 bug、根因、修复位置和验证方式
- **AND** 最终说明 MUST 列出未运行检查的原因和剩余风险
