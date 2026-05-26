## Why

当前训练数据模型把用户动作编排、计划日、日历安排和完成状态混在 `WorkoutPlan`、`WorkoutPlanDay`、`WorkoutPlanItem`、`WorkoutSession` 里，表名和产品语义不一致，已经导致对“编排列表、计划、日历、训练记录”的理解偏差。

本次需要按最新产品理解重构：最小单元是动作，动作组成编排列表，编排列表被安排到日历，用户完成训练后形成训练结果。这个改动属于数据库核心模型重构，项目仍处于开发阶段，可以做破坏性改动；目标是把模型改正确，不为旧训练数据和旧接口命名保留兼容层。

## What Changes

- **BREAKING** 重构训练相关 Prisma 模型，用 `WorkoutRoutine`、`WorkoutRoutineItem`、`WorkoutSchedule`、`WorkoutSessionResult` 替代当前训练持久化核心模型。
- **BREAKING** 移除或停用 `WorkoutPlanDay` 作为用户单次编排的中间层；用户保存的动作编排必须直接落到 `WorkoutRoutine` 与 `WorkoutRoutineItem`。
- **BREAKING** 将当前 `WorkoutSession` 的“日历安排 + 粗完成状态”职责拆分：
  - `WorkoutSchedule` 负责某个日期安排哪套 `WorkoutRoutine`，以及 planned/missed/cancelled/rest 等日历状态。
  - `WorkoutSessionResult` 负责一次实际训练完成结果，包括开始/结束时间、实际训练时长、完成状态和后续可扩展的执行摘要。
- **BREAKING** 替换旧 workout API 路径和前端命名，不保留 `/api/workouts`、`/api/workout-sessions`、`SavedWorkout`、`ScheduledWorkout`、`planId` 等旧语义作为兼容入口。
- **BREAKING** 允许开发期重建训练相关数据库表；旧 `WorkoutPlan`、`WorkoutPlanDay`、`WorkoutPlanItem`、`WorkoutSession` 中的训练业务数据不作为必须迁移对象。
- 保留 `Exercise` 作为动作事实来源，`WorkoutRoutineItem.exerciseId` 必须继续引用数据库动作，禁止保存不存在的动作。
- 保留现有产品界面的核心对象：动作库、动作编排页、训练日历页、训练执行页；不新增“计划外壳”表，因为当前界面没有独立展示计划外壳。
- 调整服务端持久化服务、共享 schema、客户端 API 包装、API Route、页面调用和测试，使命名和数据流符合最新模型。
- 更新数据库说明文档，明确这是当前实现状态，不把旧 `WorkoutPlan` 三层结构继续描述成产品计划模型。

## Capabilities

### New Capabilities
- `workout-data-model`: 定义动作编排、日历安排和训练结果的持久化模型、关系、迁移约束和 API 语义。

### Modified Capabilities
- `workout-session-step-flow`: 训练执行完成时的服务端持久化目标从粗粒度 schedule 状态更新调整为记录 `WorkoutSessionResult`，同时保留本地完成态与服务端写入结果解耦。

## Impact

- Prisma schema 和迁移：
  - `prisma/schema.prisma`
  - 新增破坏性数据库迁移或开发期重建策略，不要求保留旧训练业务数据。
- 服务端持久化层：
  - `lib/server/workouts/workout-persistence-service.ts`
  - `lib/server/users/current-user.ts` 的关系字段引用如有需要同步调整。
- 共享领域类型与校验：
  - `lib/shared/workouts/composition.ts`
  - `lib/shared/workouts/persistence-schema.ts`
  - 可能新增 routine/schedule/result 命名的共享 schema。
- HTTP API 和客户端调用：
  - 新增或替换为 `app/api/workout-routines/*`
  - 新增或替换为 `app/api/workout-schedules/*`
  - 新增或替换为训练结果提交 API，例如 `app/api/workout-session-results/*`
  - `features/workouts/api/workout-data-client.ts`
  - 不保留旧 URL 兼容层，调用方一次性切换到 routine/schedule/result 语义。
- 前端功能面：
  - `features/workouts/components/action-composer-page.tsx`
  - `features/workouts/components/workout-plan-draft-card.tsx`
  - `features/workouts/components/training-plan-page.tsx`
  - `features/workouts/components/workout-session-page.tsx`
  - `features/workout-plans/lib/saved-workout.ts`
- 测试与文档：
  - `tests/persistence-services.test.ts`
  - `tests/api-routes.test.ts`
  - `tests/client-api.test.ts`
  - `tests/shared-schemas.test.ts`
  - `tests/workout-plan.test.ts`
  - `docs/database-design.md`
