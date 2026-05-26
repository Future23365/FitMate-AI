## 1. 审计入口确认

- [x] 1.1 确认 `refactor-workout-data-model` 的实现任务已完成，且没有未处理的重构任务
- [x] 1.2 运行 `openspec validate refactor-workout-data-model --strict`
- [x] 1.3 记录当前分支、提交、数据库状态和是否执行过 reset 或迁移

## 2. 旧模型残留扫描

- [x] 2.1 使用 `rg` 扫描当前源码、测试和当前文档中的 `WorkoutPlan`、`WorkoutPlanDay`、`WorkoutPlanItem`、`WorkoutSession`
- [x] 2.2 使用 `rg` 扫描 `SavedWorkout`、`ScheduledWorkout`、`ScheduleStatus`、`planId`
- [x] 2.3 使用 `rg` 扫描旧 API 路径 `/api/workouts`、`/api/workout-sessions`
- [x] 2.4 为允许保留的历史路径列出例外，例如归档 OpenSpec 文档和旧迁移文件
- [x] 2.5 修复当前业务代码、当前测试和当前数据库说明中的旧命名残留

## 3. Prisma 与数据库排查

- [x] 3.1 运行 `npx prisma validate`
- [x] 3.2 运行 `npm run db:generate`
- [x] 3.3 按重构实现方式运行迁移或开发期 reset，并记录命令和结果
- [x] 3.4 如动作库为空或全库 reset，运行 `npm run db:seed`
- [x] 3.5 验证 `Exercise` 数据仍可查询，且新训练表为 `WorkoutRoutine`、`WorkoutRoutineItem`、`WorkoutSchedule`、`WorkoutSessionResult`
- [x] 3.6 检查 routine item 的 `exerciseId` 外键、sortOrder 唯一约束和 schedule/result 关联约束

## 4. 共享 schema 与领域逻辑测试

- [x] 4.1 补充或更新 routine、routine item、schedule、session result 的 Zod schema 测试
- [x] 4.2 补充非法状态、非法数字、非法日期、缺少必填字段和非法 exerciseId 的失败路径测试
- [x] 4.3 运行相关 shared schema 和 workout composition 测试
- [x] 4.4 修复发现的问题，并重新运行失败测试

## 5. 服务层排查

- [x] 5.1 补充或更新 routine CRUD 服务测试，覆盖 userId 隔离、排序、归档或删除路径
- [x] 5.2 补充或更新 schedule 服务测试，覆盖普通训练、休息日、状态更新、取消路径和 schedule 展示快照
- [x] 5.3 补充或更新 session result 服务测试，覆盖完成事务、失败回滚、非法 schedule 和非负数值校验
- [x] 5.4 验证所有 routine item 保存前都通过数据库校验 `exerciseId`
- [x] 5.5 运行 persistence service 相关测试，修复并回归

## 6. API 与客户端排查

- [x] 6.1 补充或更新 `app/api/workout-routines/*` route 测试
- [x] 6.2 补充或更新 `app/api/workout-schedules/*` route 测试
- [x] 6.3 补充或更新训练结果提交 route 测试，优先覆盖 `/api/workout-schedules/[id]/result`
- [x] 6.4 补充或更新 `features/workouts/api/workout-data-client.ts` 测试，确认新 URL、请求体、错误映射和事件通知
- [x] 6.5 确认旧 `/api/workouts`、`/api/workout-sessions` 不再被当前调用面使用
- [x] 6.6 运行 API route 和 client API 相关测试，修复并回归

## 7. 用户流程回归排查

- [x] 7.1 验证动作编排页新建、复制、保存、读取、更新、删除 routine 的数据流
- [x] 7.2 验证 AI 多日草稿保存为多个 routine，并在排期时生成多个 schedule 和 rest schedule
- [x] 7.3 验证训练日历页读取 schedule、安排 routine、设置休息日、状态更新、月度统计和卡片徽标
- [x] 7.4 验证训练执行页使用 `/training?scheduleId=<id>` 加载 schedule 与 routine
- [x] 7.5 验证训练完成 payload 包含实际训练秒数、完成步骤数、总步骤数、完成动作数、总动作数和估算热量
- [x] 7.6 验证 result 写入失败时本地完成态不回滚
- [x] 7.7 验证已完成 schedule 再次打开时仍进入待开始状态

## 8. 日志与运行时排查

- [x] 8.1 如出现终端、编译、启动或运行时报错，读取 `codex_logs/error_log.js` 并按真实错误定位
- [x] 8.2 如 AI 草稿生成、保存或动作 id 校验异常，读取 `codex_logs/ai_trace_log.js`
- [x] 8.3 对每个运行时 bug 记录现象、根因、修复位置和验证方式

## 9. 完整命令矩阵

- [x] 9.1 运行 `npm test`
- [x] 9.2 运行 `npm run typecheck`
- [x] 9.3 运行 `npm run lint`
- [x] 9.4 运行 `npm run build`
- [x] 9.5 如任一命令失败，修复后重新运行失败命令和受影响的相关检查

## 10. 最终排查报告

- [x] 10.1 汇总所有执行过的命令和结果
- [x] 10.2 汇总发现的 bug、根因、修复文件和新增测试
- [x] 10.3 汇总未能运行的检查、原始失败原因和剩余风险
- [x] 10.4 确认 `audit-workout-data-model-refactor` 可作为 `refactor-workout-data-model` 完成后的质量门禁归档
