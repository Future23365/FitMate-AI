## Why

`refactor-workout-data-model` 是训练数据模型的破坏性重构，会同时影响 Prisma schema、服务端持久化、API、共享类型、动作编排页、训练日历页、训练执行页和自动化测试。该 change 完成后必须有独立、系统化的 bug 排查与修复方案，避免只靠编译通过或局部测试遗漏数据流断裂、旧命名残留、权限隔离缺口和训练完成记录异常。

## What Changes

- 新增一套重构后排查流程，要求在 `refactor-workout-data-model` 实现完成后按固定顺序执行：静态扫描、数据库/schema 检查、服务层测试、API 边界测试、前端业务流测试、构建检查、日志排查和缺陷修复回归。
- 明确必须排查的高风险区域：
  - 旧 `WorkoutPlan` / `WorkoutPlanDay` / `WorkoutPlanItem` / `WorkoutSession` / `SavedWorkout` / `ScheduledWorkout` / `planId` / `/api/workouts` / `/api/workout-sessions` 残留。
  - 新 `WorkoutRoutine` / `WorkoutRoutineItem` / `WorkoutSchedule` / `WorkoutSessionResult` 的关系、权限隔离、状态转换和事务一致性。
  - AI 草稿保存到 routine + schedule 的链路。
  - `/training?scheduleId=<id>` 加载、执行、完成、重复打开的链路。
  - 训练完成 result 写入失败时本地完成态不回滚的链路。
- 明确 bug 修复闭环：每一类排查发现的问题都必须定位根因、修复、补测试或补验证，并重新运行对应检查。
- 扩展自动化测试计划，覆盖 schema、service、route、client、AI 草稿转换、训练执行状态和新 API 命名。
- 规定最终验收输出必须列出执行过的命令、失败和修复记录、未能运行的检查及剩余风险。

## Capabilities

### New Capabilities
- `workout-data-model-refactor-audit`: 定义训练数据模型大重构完成后的全面排查、修复和验证流程。

### Modified Capabilities
- `testing-workflow`: 对高风险数据库重构的验收要求增加专项排查和缺陷修复闭环。
- `test-coverage`: 对 workout 数据模型重构相关测试覆盖范围增加明确要求。

## Impact

- OpenSpec 工作流：
  - 该 change 应在 `refactor-workout-data-model` 实现完成后执行。
  - 不能替代 `refactor-workout-data-model` 自身的实现任务，而是作为完成后的质量门禁。
- 代码排查范围：
  - `prisma/schema.prisma`
  - `prisma/migrations/*`
  - `lib/server/workouts/*`
  - `lib/shared/workouts/*`
  - `features/workouts/api/workout-data-client.ts`
  - `features/workouts/components/action-composer-page.tsx`
  - `features/workouts/components/workout-plan-draft-card.tsx`
  - `features/workouts/components/training-plan-page.tsx`
  - `features/workouts/components/workout-session-page.tsx`
  - `app/api/workout-routines/*`
  - `app/api/workout-schedules/*`
  - 训练结果提交 route
- 测试与验证：
  - `npm test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `npx prisma validate`
  - `npm run db:generate`
  - `npm run db:seed`
  - 必要时读取 `codex_logs/error_log.js` 和 `codex_logs/ai_trace_log.js`
