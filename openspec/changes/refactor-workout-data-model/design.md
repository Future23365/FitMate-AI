## Context

当前数据库把训练相关数据压在旧模型里：

- `WorkoutPlan` 实际同时承担“用户保存的动作编排列表”和“训练计划”的语义。
- `WorkoutPlanDay` 为了多日计划存在，但当前用户自建编排只是固定 `dayIndex = 1` 的中间容器。
- `WorkoutPlanItem` 实际是动作编排项。
- `WorkoutSession` 同时承担日历安排、休息日、完成/未完成状态和少量展示统计。

最新产品理解是：动作是最小单元，动作组成编排列表，编排列表被安排到日历，用户完成训练后形成训练结果。当前界面没有独立展示“计划外壳”，所以不再新增或保留 `WorkoutPlan` 作为长期存在的父级计划表。

项目当前未上线，训练相关数据没有生产兼容要求。本 change 采用破坏性重构：可以删除旧训练表、替换旧 API 路径、重命名前端共享类型，并要求调用面一次性切换到新语义。

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
- 使用破坏性 Prisma 迁移或开发期数据库重建，删除旧训练模型，不迁移旧训练业务数据。
- 更新服务端、共享 schema、前端 API 包装和测试命名，删除旧 `Plan`/`SavedWorkout`/`ScheduledWorkout` 概念。

**Non-Goals:**

- 不新增独立 `WorkoutPlan`/`Program` 父级表；当前产品没有计划详情页、计划暂停、计划完成率等外壳能力。
- 不重构 AI 生成草稿的完整 prompt 语义；AI 仍可生成多日草稿，但保存时应转成多个 `WorkoutRoutine` 和多个 `WorkoutSchedule`。
- 不在本次强制实现每组级别训练明细；`WorkoutSessionResult` 先保存本次训练结果摘要，并为后续 `WorkoutSessionExerciseResult`/`WorkoutSetResult` 预留扩展。
- 不改变动作库 `Exercise` 的导入和查询模型。
- 不保留旧训练数据迁移、旧 API URL 兼容、旧共享类型别名或旧查询参数名。

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
- `status`: `planned` / `completed` / `missed` / `cancelled` / `rest`
- `titleSnapshot`
- `estimatedMinutes`
- `estimatedCalories`
- `createdAt`
- `updatedAt`

`routineId` 对休息日可为空；普通训练安排必须关联 `WorkoutRoutine`。`titleSnapshot`、`estimatedMinutes`、`estimatedCalories` 是日历展示快照，避免 routine 后续改名或改参数导致历史日历展示漂移。

取舍：不保留旧 `feedback.sourcePlanTitle` 的迁移字段。如果后续确实需要按一次 AI 生成批次分组或批量替换日历安排，应新增明确的 `generationBatchId` 或 `batchLabel` 字段，而不是复用旧反馈 JSON 语义。

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

### 5. API 路径一次性改成新语义

旧路径和旧命名会继续误导模型边界，因此本次不做 URL 兼容层。建议改为：

- `/api/workout-routines`
- `/api/workout-routines/[id]`
- `/api/workout-schedules`
- `/api/workout-schedules/[id]`
- `/api/workout-session-results` 或 `/api/workout-schedules/[id]/result`

客户端函数同步使用 `listWorkoutRoutines`、`createWorkoutRoutine`、`updateWorkoutRoutine`、`deleteWorkoutRoutine`、`listWorkoutSchedules`、`createWorkoutSchedule`、`updateWorkoutScheduleStatus`、`deleteWorkoutSchedule`、`saveWorkoutSessionResult`。

取舍：这是破坏性改动，会要求所有调用面一次性切换，但比保留旧 `/api/workouts` 和 `/api/workout-sessions` 更符合当前产品语义。

### 6. AI 计划草稿保存为 routine + schedule，不保存计划外壳

AI 生成的多日草稿只是展示和保存来源，不产生 `WorkoutPlan` 父表。保存时：

- 每个训练日转换成一套 `WorkoutRoutine`。
- 如果用户选择排期，则为日期范围生成 `WorkoutSchedule`，每个训练日 schedule 指向对应 routine。
- 休息日生成 `WorkoutSchedule(status = rest, routineId = null)`。
- 本次不为“同一批 AI 草稿”创建持久化父实体；如后续需要批量替换，可新增明确的批次字段。

### 7. 命名一次性收敛

共享类型和服务函数必须一次性重命名：

- `SavedWorkout` -> `WorkoutRoutine`
- `WorkoutItem` 在持久化语境中改为 `WorkoutRoutineItem`；如果训练执行层仍需要轻量执行项，应使用独立的执行层类型名。
- `ScheduledWorkout` -> `WorkoutSchedule`
- `ScheduleStatus` -> `WorkoutScheduleStatus`
- 训练页 URL 查询参数从 `planId` 改为 `scheduleId`

文件名是否移动按模块清晰度决定，但导出的类型、函数、schema、API 路径和路由参数不能保留旧业务含义。

## Risks / Trade-offs

- **破坏性重建导致本地旧训练数据丢失** → 接受该结果；实现前确认只影响训练相关开发数据，不删除 `Exercise`、`User`、`ChatSession` 等非目标数据。
- **历史日历展示漂移** → `WorkoutSchedule` 必须保存标题、分钟、热量等展示快照，不只依赖当前 routine。
- **完成状态与结果重复** → schedule 的 `completed` 用于列表筛选和日历徽标，result 用于完成详情；服务层必须保证完成操作在事务里同时维护两者。
- **API URL 破坏性变更导致调用面大面积报错** → 先改客户端 API 封装和 route 测试，再替换页面调用，避免旧路径残留。
- **AI 多日草稿缺少父级实体后不好批量替换** → 本次不做批量计划外壳；如果后续有真实 UI 需求，再加明确的批次字段或计划实体。
- **测试 fixture 大量失效** → 先更新共享 fixture 工厂，再改 persistence/API/client 测试，避免每个测试重复构造新模型。
- **迁移期间 Prisma 类型大面积报错** → 先改 schema 和服务层查询 include，再改共享类型和前端调用，最后清理旧类型和文档。

## Migration Plan

1. 修改 `prisma/schema.prisma`：
   - 新增 `WorkoutRoutine`、`WorkoutRoutineItem`、`WorkoutSchedule`、`WorkoutSessionResult`。
   - 新增或重命名对应 enum：`WorkoutRoutineStatus`、`WorkoutRoutineSource`、`WorkoutScheduleStatus`、`WorkoutSessionResultStatus`。
   - 更新 `User` 和 `Exercise` 关系字段。
2. 创建破坏性 Prisma 迁移或执行开发期数据库重建：
   - 删除旧 `WorkoutPlan`、`WorkoutPlanDay`、`WorkoutPlanItem`、`WorkoutSession`。
   - 删除旧训练相关 enum。
   - 不迁移旧训练业务数据。
   - 保留动作库、用户、聊天历史等非本次目标数据，除非实现时明确选择全库 reset 并重新 seed。
3. 更新服务层：
   - 将 workout persistence service 拆成 routine、schedule、session result 三组方法，或在同一模块内按三段清晰分区。
   - 所有查询必须带 `userId` 隔离。
   - 完成训练使用事务写入 result 并更新 schedule。
4. 更新共享 schema 和客户端 API：
   - 新增 routine/schedule/result schema。
   - 新增新 API 路径并删除旧 workout/workout-session 路由调用。
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

- `WorkoutSchedule.status` 是否保留 `completed`，还是完全通过 `WorkoutSessionResult` 判断完成？当前建议保留，便于日历列表和统计查询。
- 训练完成结果 API 使用 `/api/workout-session-results` 还是 `/api/workout-schedules/[id]/result`？当前建议选后者，因为结果必须归属于某条 schedule。
