## 审计报告

### 基线

- change：`audit-workout-data-model-refactor`
- 前置 change：`refactor-workout-data-model`
- 前置任务状态：`refactor-workout-data-model` 为 `49/49` 完成，`openspec validate refactor-workout-data-model --strict` 通过
- 当前分支：`master`
- 当前 HEAD：`fa41fc4653e0cb825aba1fa1b161ca76036efd69`
- 初始工作区状态：`next-env.d.ts` 已有未提交修改；本次审计新增和修改的文件另行记录

### 执行过的命令与结果

- `openspec instructions apply --change "refactor-workout-data-model" --json`：通过，进度 `49/49`
- `openspec validate refactor-workout-data-model --strict`：通过
- `git status --short --branch`：当前分支 `master`，发现既有 `next-env.d.ts` 修改
- `git rev-parse HEAD`：`fa41fc4653e0cb825aba1fa1b161ca76036efd69`
- `docker compose ps`：沙箱内因 Docker API 权限失败；沙箱外通过，`fitmate-postgres` 为 `Up` 且 `healthy`
- `npx prisma migrate status`：沙箱内返回 `Error: Schema engine error:`；沙箱外通过，`Database schema is up to date!`
- `npm run db:migrate -- --skip-seed`：未执行成功；审批系统拒绝写入型迁移命令，因为当前只读迁移状态已确认最新，继续执行可能修改本机 schema 或触发 reset
- `rg` 旧模型命名扫描：当前源码、测试、README、数据库文档和当前 specs 已清理；仅保留在当前 OpenSpec change 文档中作为历史背景或审计要求
- `npx prisma validate`：通过
- `npm run db:generate`：通过，生成 Prisma Client `v7.8.0`
- PostgreSQL 只读数据量查询：`Exercise = 873`，`WorkoutRoutine = 0`，`WorkoutRoutineItem = 0`，`WorkoutSchedule = 0`，`WorkoutSessionResult = 0`
- PostgreSQL 只读约束查询：确认 `WorkoutRoutineItem.exerciseId`、`WorkoutRoutineItem.routineId`、`WorkoutSchedule.userId`、`WorkoutSchedule.routineId`、`WorkoutSessionResult.scheduleId`、`WorkoutSessionResult.userId`、`WorkoutSessionResult.routineId` 外键存在
- PostgreSQL 只读索引查询：确认 `WorkoutRoutineItem_routineId_sortOrder_key` 和 `WorkoutSessionResult_scheduleId_key` 存在
- `npm test -- tests/shared-schemas.test.ts tests/persistence-services.test.ts`：通过，`2` 个文件、`13` 个测试
- `npm test -- tests/api-routes.test.ts tests/client-api.test.ts tests/workout-composition.test.ts tests/workout-session-flow.test.ts tests/workout-plan.test.ts`：通过，`5` 个文件、`15` 个测试
- `npm test`：通过，`20` 个文件、`69` 个测试
- `npm run typecheck`：通过
- `npm run lint`：通过
- `openspec validate --specs --strict`：通过，`11` 个 spec 全部通过
- `openspec validate audit-workout-data-model-refactor --strict`：通过
- `npm run build`：沙箱内因 Turbopack `Operation not permitted (os error 1)` 失败；沙箱外同命令通过

### 发现并修复的问题

- 现象：`features/workouts/components/workout-session-page.tsx` 中日志标签仍使用 `[WorkoutSession]`。
  - 根因：执行页组件日志继承了旧持久化模型名称，容易和已删除的 Prisma `WorkoutSession` 模型混淆。
  - 修复位置：`features/workouts/components/workout-session-page.tsx`
  - 修复方式：改为 `[TrainingSession]`，保留训练执行页语义但不继续引用旧持久化模型名。
  - 验证：旧命名 `rg` 扫描不再命中当前源码；`npm run lint`、`npm run typecheck`、`npm test`、`npm run build` 通过。

- 现象：当前 OpenSpec spec `openspec/specs/workout-session-step-flow/spec.md` 仍用 `planId` 描述 `/training`。
  - 根因：前置数据模型重构后，训练执行入口已经切换为 `scheduleId`，但历史归档 spec 未同步。
  - 修复位置：`openspec/specs/workout-session-step-flow/spec.md`
  - 修复方式：将 `/training?planId=<id>` 和缺少 `planId` 的描述更新为 `/training?scheduleId=<id>` / `scheduleId`。
  - 验证：`openspec validate --specs --strict` 通过，旧命名扫描不再命中当前 specs。

- 现象：schema/service 层测试覆盖不足，无法明确证明 routine item 数字校验、非法 `exerciseId`、rest schedule、result 失败路径和 sortOrder 写入。
  - 根因：前置重构已有 happy path 测试，但审计要求需要覆盖失败路径和数据库关系边界。
  - 修复位置：`tests/shared-schemas.test.ts`、`tests/persistence-services.test.ts`
  - 修复方式：补充 routine item 非法值、schedule 缺字段/非法状态/非法数字、session result 非法日期/缺字段/非负数校验；补充服务层保存前 `exerciseId` 校验、sortOrder 写入、休息日 schedule、普通 schedule 快照、非法 result 和缺失 schedule 测试。
  - 验证：定向测试、完整 `npm test`、`typecheck`、`lint`、`build` 均通过。

### 例外与剩余风险

- 旧命名例外：`openspec/changes/refactor-workout-data-model/**` 和 `openspec/changes/audit-workout-data-model-refactor/**` 仍保留旧模型名，用于描述历史设计、破坏性重构范围和审计扫描要求；当前源码、测试、README、数据库文档和当前 specs 不再保留旧持久化语义。
- `npm run db:seed` 未运行：本次没有执行 reset，且只读 SQL 确认 `Exercise` 有 873 条，因此不需要重新 seed。
- `npm run db:migrate -- --skip-seed` 未执行：审批系统拒绝写入型迁移命令；已用 `npx prisma migrate status`、`npx prisma validate`、`npm run db:generate` 和只读 PostgreSQL 约束查询替代验证。剩余风险是没有在本轮重新实际执行一次写入型 migrate/reset。
- `codex_logs/error_log.js` 已读取：当前内容主要是 dev 期间 Prisma query 日志，没有看到与本次审计修复直接相关的运行时错误。`codex_logs/ai_trace_log.js` 未读取，因为本轮没有出现 AI 草稿生成、保存或动作 id 校验异常。
- 未做浏览器验证：本轮没有打开页面，原因是项目规则默认禁止主动浏览器验证，且本次问题可由静态扫描、单元测试、类型检查、lint、构建和数据库只读检查覆盖。

### 结论

`audit-workout-data-model-refactor` 已完成质量门禁要求。除写入型 `npm run db:migrate -- --skip-seed` 因风险审批未执行外，前置 change 状态、旧命名残留、Prisma schema、Prisma client 生成、数据库表与约束、schema/service/API/client/训练流程测试、类型检查、lint、build 和 OpenSpec 校验均已通过或完成记录。该 change 可以作为 `refactor-workout-data-model` 完成后的质量门禁归档。
