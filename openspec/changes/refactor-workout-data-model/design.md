## Context

当前数据库把训练相关数据压在旧模型里：

- `WorkoutPlan` 实际同时承担“用户保存的动作编排列表”和“训练计划”的语义。
- `WorkoutPlanDay` 为了多日计划存在，但当前用户自建编排只是固定 `dayIndex = 1` 的中间容器。
- `WorkoutPlanItem` 实际是动作编排项。
- `WorkoutSession` 同时承担日历安排、休息日、完成/未完成状态和少量展示统计。

最新产品理解是：动作是最小单元，动作组成编排列表，编排列表被安排到日历，用户完成训练后形成训练结果。当前界面没有独立展示“计划外壳”，所以不再新增或保留 `WorkoutPlan` 作为长期存在的父级计划表。

## Goals / Non-Goals

**Goals:**

- 建立和产品语义一致的持久化模型：
  - `WorkoutRoutine`：用户保存的一套动作编排列表。
  - `WorkoutRoutineItem`：编排列表中的动作项和训练参数。
  - `WorkoutSchedule`：日历上某一天安排哪套编排，或休息日。
  - `WorkoutSessionResult`：用户实际完成一次训练后的结果记录。
- 删除 `WorkoutPlanDay` 对单次编排的强制中间层。
- 将 `WorkoutSession` 的日历职责和训练结果职责拆开。
- 保持 `Exercise` 作为动作事实来源，所有 routine item 继续通过 `exerciseId` 引用动作库。
- 在迁移中尽量保留现有用户保存编排、日历安排、完成/未完成状态、预估分钟和热量展示数据。
- 更新服务端、共享 schema、前端 API 包装和测试命名，减少旧 `Plan`/`SavedWorkout`/`ScheduledWorkout` 概念继续扩散。

**Non-Goals:**

- 不新增独立 `WorkoutPlan`/`Program` 父级表；当前产品没有计划详情页、计划暂停、计划完成率等外壳能力。
- 不重构 AI 生成草稿的完整 prompt 语义；AI 仍可生成多日草稿，但保存时应转成多个 `WorkoutRoutine` 和多个 `WorkoutSchedule`。
- 不在本次强制实现每组级别训练明细；`WorkoutSessionResult` 先保存本次训练结果摘要，并为后续 `WorkoutSessionExerciseResult`/`WorkoutSetResult` 预留扩展。
- 不改变动作库 `Exercise` 的导入和查询模型。

## Decisions

### 1. 用 `WorkoutRoutine` 表达用户可复用动作编排

`WorkoutRoutine` 是当前产品里的核心可复用训练模板，替代旧 `WorkoutPlan` 的真实职责。建议字段：

- `id`
- `userId`
- `title`
- `description` 或 `summary`
- `source`: `manual` / `ai` / `imported`
- `status`: `active` / `archived`
- `estimatedMinutes`
- `estimatedCalories`
- `trainingLoopRounds`
- `trainingLoopRestSeconds`
- `sourceAiTraceId`
- `createdAt`
- `updatedAt`

取舍：不保留 `goal`、`weeklyFrequency` 作为必填字段。它们更像 AI 草稿或计划建议，不是每个动作编排列表的必需事实。若界面后续需要，可作为可空字段或 metadata 增加，但本次不应继续让 routine 假装是长期 plan。

### 2. 用 `WorkoutRoutineItem` 直接挂到 `WorkoutRoutine`

`WorkoutRoutineItem` 替代旧 `WorkoutPlanItem`，直接通过 `routineId` 归属编排列表，不再经过 `WorkoutPlanDay`。建议字段：

- `id`
- `routineId`
- `exerciseId`
- `mode`: `reps` / `duration`
- `target`
- `sets`
- `setRestSeconds`
- `transitionRestSeconds`
- `section`: `warmup` / `training` / `stretch`
- `notes`
- `sortOrder`
- `createdAt`
- `updatedAt`

约束：

- `@@unique([routineId, sortOrder])`
- `@@index([exerciseId])`
- `@@index([routineId, sortOrder])`
- `Exercise` 删除仍应 `Restrict`，避免 routine item 悬空。

取舍：不再保留 `dayIndex`。如果 AI 草稿有多个训练日，每个训练日保存为一套独立 `WorkoutRoutine`，标题可用草稿标题和训练日标题组合，日历通过多个 schedule 表达“计划”。

### 3. 用 `WorkoutSchedule` 表达日历安排

`WorkoutSchedule` 是日历上的事实：哪一天安排哪套 routine，或者这一天是休息日。建议字段：

- `id`
- `userId`
- `routineId?`
- `scheduledFor`
- `status`: `planned` / `missed` / `cancelled` / `rest`
- `titleSnapshot`
- `estimatedMinutes`
- `estimatedCalories`
- `sourceLabel?`
- `createdAt`
- `updatedAt`

`routineId` 对休息日可为空；普通训练安排必须关联 `WorkoutRoutine`。`titleSnapshot`、`estimatedMinutes`、`estimatedCalories` 是日历展示快照，避免 routine 后续改名或改参数导致历史日历展示漂移。

取舍：可以保留 `sourceLabel` 替代旧 `feedback.sourcePlanTitle`，用于“这批安排来自某次 AI 草稿标题”的 UI 分组或替换，但它不是计划外壳，也不作为长期计划实体。

### 4. 用 `WorkoutSessionResult` 表达实际训练完成结果

`WorkoutSessionResult` 是一次训练执行结果，关联 `WorkoutSchedule`。建议字段：

- `id`
- `userId`
- `scheduleId`
- `routineId?`
- `startedAt`
- `endedAt`
- `durationSeconds`
- `completedStepCount`
- `totalStepCount`
- `completedExerciseCount`
- `totalExerciseCount`
- `estimatedCalories`
- `actualCalories?`
- `status`: `completed` / `abandoned`
- `feedback?`
- `createdAt`
- `updatedAt`

完成训练时应创建或更新 result，同时把对应 schedule 标记为 `completed`。如果先不希望 schedule enum 包含 `completed`，也可以通过 result 是否存在判断完成，但考虑现有日历 UI 依赖 status 展示，本次建议 `WorkoutScheduleStatus` 继续包含 `completed`，并让 result 成为完成详情来源。

取舍：不直接做每组级别记录。当前训练执行页已经有 `elapsedSeconds`、完成步骤、当前动作和估算热量，先把这些摘要写入 result，后续再扩展动作级/组级结果表。

### 5. API 路径先兼容，内部语义重命名

现有前端大量调用：

- `/api/workouts`
- `/api/workouts/[id]`
- `/api/workout-sessions`
- `/api/workout-sessions/[id]`

为降低一次性改动风险，可以先保持路径兼容：

- `/api/workouts` 内部改为 routine CRUD，客户端函数重命名为 `listWorkoutRoutines`、`createWorkoutRoutine`、`updateWorkoutRoutine`、`deleteWorkoutRoutine`。
- `/api/workout-sessions` 内部改为 schedule CRUD，客户端函数重命名为 `listWorkoutSchedules`、`createWorkoutSchedule`、`updateWorkoutScheduleStatus`、`deleteWorkoutSchedule`。
- 训练完成新增明确服务方法，例如 `completeWorkoutSchedule()` 或 `saveWorkoutSessionResult()`，可以复用现有 PATCH 路径，也可以新增更语义化 endpoint。若新增 endpoint，应在任务中同步更新 route 测试。

取舍：路径可以后续再统一改成 `/api/workout-routines` 和 `/api/workout-schedules`。本次重点是数据库和代码语义，不强制同时改 URL，避免 UI 调用面过大。

### 6. AI 计划草稿保存为 routine + schedule，不保存计划外壳

AI 生成的多日草稿只是展示和保存来源，不产生 `WorkoutPlan` 父表。保存时：

- 每个训练日转换成一套 `WorkoutRoutine`。
- 如果用户选择排期，则为日期范围生成 `WorkoutSchedule`，每个训练日 schedule 指向对应 routine。
- 休息日生成 `WorkoutSchedule(status = rest, routineId = null)`。
- 如需区分同一批 AI 草稿，可以写 `sourceLabel`，但不能依赖它表达正式计划实体。

### 7. 命名逐步收敛，但避免大面积无意义改文件名

共享类型应优先重命名：

- `SavedWorkout` -> `WorkoutRoutine`
- `WorkoutItem` -> `WorkoutRoutineItem` 或保留执行层 `WorkoutItem`，但持久化 schema 使用 routine 命名。
- `ScheduledWorkout` -> `WorkoutSchedule`
- `ScheduleStatus` -> `WorkoutScheduleStatus`

文件名可按模块边界逐步调整，不必为了命名一次性移动所有 UI 文件。关键是服务、schema、API client 和测试中的业务对象名必须收敛。

## Risks / Trade-offs

- **数据迁移丢失关联** → 迁移脚本必须明确旧表到新表映射，并在迁移后校验 routine 数量、item 数量、schedule 数量和已完成状态数量。
- **历史日历展示漂移** → `WorkoutSchedule` 必须保存标题、分钟、热量等展示快照，不只依赖当前 routine。
- **完成状态与结果重复** → schedule 的 `completed` 用于列表筛选和日历徽标，result 用于完成详情；服务层必须保证完成操作在事务里同时维护两者。
- **API 命名和 URL 不一致** → 本次允许 URL 兼容，但客户端函数和服务命名必须改成 routine/schedule/result，避免继续把旧名字扩散。
- **AI 多日草稿缺少父级实体后不好批量替换** → 用 `sourceLabel` 或一次性生成的 `importBatchId` 作为 schedule 的轻量来源标记；它不是产品级 plan 表，不承载独立生命周期。
- **测试 fixture 大量失效** → 先更新共享 fixture 工厂，再改 persistence/API/client 测试，避免每个测试重复构造新模型。
- **迁移期间 Prisma 类型大面积报错** → 先改 schema 和服务层查询 include，再改共享类型和前端调用，最后清理旧类型和文档。

## Migration Plan

1. 修改 `prisma/schema.prisma`：
   - 新增 `WorkoutRoutine`、`WorkoutRoutineItem`、`WorkoutSchedule`、`WorkoutSessionResult`。
   - 新增或重命名对应 enum：`WorkoutRoutineStatus`、`WorkoutRoutineSource`、`WorkoutScheduleStatus`、`WorkoutSessionResultStatus`。
   - 更新 `User` 和 `Exercise` 关系字段。
2. 创建 Prisma 迁移：
   - 旧 `WorkoutPlan` + 第一层 `WorkoutPlanDay` 迁移为 `WorkoutRoutine`。
   - 旧 `WorkoutPlanItem` 迁移为 `WorkoutRoutineItem`。
   - 旧 `WorkoutSession` 迁移为 `WorkoutSchedule`。
   - 旧 `WorkoutSession.status = completed` 的记录迁移出基础 `WorkoutSessionResult`，至少保存 `startedAt`、`endedAt`、`durationSeconds` 和 completed 状态。
   - 旧 `feedback.minutes`、`feedback.calories`、`feedback.sourcePlanTitle` 分别迁移到 schedule 展示快照和来源标记。
3. 更新服务层：
   - 将 workout persistence service 拆成 routine、schedule、session result 三组方法，或在同一模块内按三段清晰分区。
   - 所有查询必须带 `userId` 隔离。
   - 完成训练使用事务写入 result 并更新 schedule。
4. 更新共享 schema 和客户端 API：
   - 新增 routine/schedule/result schema。
   - 兼容 API 路径时，函数名仍应改成产品语义。
5. 更新 UI 调用：
   - 动作编排页只保存 routine。
   - 训练日历页只安排 routine 到 schedule。
   - 训练执行页从 schedule 加载 routine 快照，并在完成时提交 session result。
6. 更新测试和文档：
   - 先改 fixture，再改 service/API/client/shared schema 测试。
   - 更新 `docs/database-design.md` 和 README 中涉及数据库现状的入口说明。
7. 验证：
   - `npx prisma validate`
   - `npm run db:generate`
   - `npm test`
   - `npm run typecheck`
   - `npm run lint`
   - 如果 API 路由或服务端/客户端边界有变化，运行 `npm run build`。

## Open Questions

- 旧数据库里如果存在多 `WorkoutPlanDay` 的 `WorkoutPlan`，是否将每个 day 拆成独立 `WorkoutRoutine`？当前建议拆分，但实现前需要用真实数据确认是否存在这种记录。
- `WorkoutSchedule.status` 是否保留 `completed`，还是完全通过 `WorkoutSessionResult` 判断完成？当前建议保留，便于日历列表和统计查询。
- 是否需要 `importBatchId` 替代 `sourceLabel` 来支持 AI 批量排期替换？当前建议先用可空轻量字段，不建计划外壳。
