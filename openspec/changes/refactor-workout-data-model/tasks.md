## 1. 重构前核对

- [x] 1.1 明确本次允许破坏性删除旧训练表，不为旧 `WorkoutPlan`、`WorkoutPlanDay`、`WorkoutPlanItem`、`WorkoutSession` 数据编写保留迁移
- [x] 1.2 确认破坏范围仅限训练相关表；如选择全库 reset，记录需要重新 seed `Exercise`
- [x] 1.3 梳理所有旧命名调用点，确认 `SavedWorkout`、`ScheduledWorkout`、`planId`、`/api/workouts`、`/api/workout-sessions` 必须一次性替换

## 2. Prisma 模型与迁移

- [x] 2.1 在 `prisma/schema.prisma` 新增 `WorkoutRoutine`、`WorkoutRoutineItem`、`WorkoutSchedule`、`WorkoutSessionResult` 及对应 enum
- [x] 2.2 更新 `User`、`Exercise` 与训练模型的 relation 字段，移除旧 `WorkoutPlan`、`WorkoutPlanDay`、`WorkoutPlanItem`、`WorkoutSession` relation
- [x] 2.3 编写破坏性 Prisma 迁移，删除旧训练表和旧训练 enum
- [x] 2.4 确认迁移或 reset 不会无意删除 `Exercise`、`User`、`ChatSession`、`ChatMessage`
- [x] 2.5 如迁移导致动作库清空，执行并记录 `npm run db:seed`
- [x] 2.6 确认数据库中只存在新 routine、schedule、session result 训练模型
- [x] 2.7 运行 `npx prisma validate` 和 `npm run db:generate`，确认 schema 与 Prisma Client 生成通过

## 3. 共享类型与校验

- [x] 3.1 将共享持久化类型从 `SavedWorkout` / `ScheduledWorkout` 一次性替换为 `WorkoutRoutine` / `WorkoutSchedule` / `WorkoutSessionResult`，不保留旧类型别名
- [x] 3.2 新增或重命名 Zod schema，覆盖 routine、routine item、schedule、session result 的请求和响应结构
- [x] 3.3 保留执行时间线所需的 `WorkoutItem` 或改名为更明确的执行层类型，避免 UI 执行逻辑被数据库命名牵连
- [x] 3.4 更新估算、循环配置和 timeline 构建入口，确保它们读取 routine items 后行为不变

## 4. 服务端持久化层

- [x] 4.1 将 `workout-persistence-service.ts` 拆分或重组为 routine、schedule、session result 三组职责
- [x] 4.2 实现 routine 列表、详情、创建、更新、归档或删除逻辑，并保持 `userId` 权限隔离
- [x] 4.3 实现 schedule 列表、详情、创建、状态更新、取消逻辑，并保持休息日和普通训练安排的边界清晰
- [x] 4.4 实现训练完成服务方法，在事务中创建或更新 `WorkoutSessionResult` 并同步更新 `WorkoutSchedule.status = completed`
- [x] 4.5 更新数据库记录到前端结构的 mapper，确保 schedule 返回 routine 快照、动作展示信息和训练执行所需数据
- [x] 4.6 确保所有 AI 或客户端传入的 `exerciseId` 在保存 routine item 前经过数据库校验

## 5. API 与客户端调用

- [x] 5.1 新增或替换为 `app/api/workout-routines/*`，并移除旧 `/api/workouts` 调用入口
- [x] 5.2 新增或替换为 `app/api/workout-schedules/*`，并移除旧 `/api/workout-sessions` 调用入口
- [x] 5.3 更新 `features/workouts/api/workout-data-client.ts` 的函数命名和类型，改为 routine、schedule、session result 语义
- [x] 5.4 新增训练结果提交 endpoint，优先使用 `/api/workout-schedules/[id]/result`，补齐 route handler、请求校验、错误响应和客户端封装
- [x] 5.5 检查 API 错误文案，确保“训练编排”“训练日历”“训练结果”语义一致

## 6. 前端功能接入

- [x] 6.1 更新动作编排页，使新建、复制、保存、删除都操作 `WorkoutRoutine`
- [x] 6.2 更新 AI 草稿保存逻辑，使每个训练日保存为独立 routine，排期时生成 schedule，不创建计划外壳
- [x] 6.3 更新训练日历页，使日历数据来自 `WorkoutSchedule`，月度统计继续基于 completed schedule/result 工作
- [x] 6.4 更新训练执行页，使 `/training?scheduleId=<id>` 加载 schedule 并读取其 routine 数据
- [x] 6.5 更新训练完成流程，提交实际训练秒数、完成步骤数、总步骤数、完成动作数、总动作数和估算热量
- [x] 6.6 保持已完成 schedule 再次打开时仍展示待开始状态，不因已有 result 自动显示本地完成态

## 7. 测试

- [x] 7.1 更新 `tests/fixtures/domain.ts`，提供 routine、routine item、schedule、session result 工厂函数
- [x] 7.2 更新共享 schema 测试，覆盖 routine、schedule、session result 校验成功和失败路径
- [x] 7.3 更新 persistence service 测试，覆盖 userId 隔离、routine 保存、schedule 创建、休息日、状态更新和训练结果写入
- [x] 7.4 更新 API route 测试，覆盖 workout-routines、workout-schedules 和训练完成结果提交
- [x] 7.5 更新 client API 测试，覆盖新函数命名、请求体和错误映射
- [x] 7.6 更新 AI 草稿转保存结构测试，确认多日草稿转为多个 routine，排期转为多个 schedule
- [x] 7.7 更新训练执行相关测试，确认本地完成态与 `WorkoutSessionResult` 写入失败解耦

## 8. 文档与清理

- [x] 8.1 更新 `docs/database-design.md`，按当前实现说明 `WorkoutRoutine`、`WorkoutRoutineItem`、`WorkoutSchedule`、`WorkoutSessionResult`
- [x] 8.2 如 README 中引用旧数据库设计入口或旧表名，同步更新说明
- [x] 8.3 清理旧 `WorkoutPlan`、`WorkoutPlanDay`、`WorkoutPlanItem`、`WorkoutSession` 相关类型、mapper、API 路径和测试命名
- [x] 8.4 确认代码注释中的业务意图已按新模型更新，避免继续描述“计划日”中间层

## 9. 验证

- [x] 9.1 运行 `openspec validate refactor-workout-data-model --strict`
- [x] 9.2 运行 `npx prisma validate`
- [x] 9.3 运行 `npm run db:generate`
- [x] 9.4 运行 `npm test`
- [x] 9.5 运行 `npm run typecheck`
- [x] 9.6 运行 `npm run lint`
- [x] 9.7 运行 `npm run build`，或记录无法运行的具体原因
