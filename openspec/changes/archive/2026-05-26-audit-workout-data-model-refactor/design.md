## Context

`refactor-workout-data-model` 会破坏性替换训练持久化核心模型，并要求调用面从旧 `WorkoutPlan` / `WorkoutSession` 语义一次性切到 `WorkoutRoutine` / `WorkoutSchedule` / `WorkoutSessionResult`。这种改动的风险不是单点编译错误，而是跨层数据流断裂：schema 生成、服务映射、API 请求体、前端页面状态、AI 草稿保存、训练执行完成、统计展示和旧命名清理都可能局部通过但整体不可用。

当前项目已有 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`、`npx prisma validate`、`npm run db:generate`、`npm run db:seed`。本方案在这些命令基础上增加专项排查顺序和问题修复闭环。

## Goals / Non-Goals

**Goals:**

- 在 `refactor-workout-data-model` 完成后，系统排查所有训练数据模型相关改动面。
- 发现并修复旧命名、旧 API、旧 schema、旧 route 参数和旧持久化 mapper 残留。
- 验证新 Prisma 模型、服务层、API 层、前端业务流和训练完成结果写入能协同工作。
- 为每个发现的 bug 补充对应自动化测试或明确验证记录。
- 形成可复用的质量门禁，防止大重构只以“能 build”为验收标准。

**Non-Goals:**

- 不重新设计 `refactor-workout-data-model` 的数据模型。
- 不新增浏览器验证默认要求；除非自动化检查无法覆盖真实页面交互、hydration、路由或运行时错误，否则仍优先使用代码阅读、类型检查、测试和构建。
- 不恢复旧数据兼容、旧 API URL 或旧类型别名。
- 不把 AI 生成质量作为本方案主要目标；本方案只验证 AI 草稿保存后的数据落点和校验链路。

## Decisions

### 1. 排查顺序按依赖从底向上执行

执行顺序固定为：

1. OpenSpec 与任务完成度核对。
2. 静态旧命名扫描。
3. Prisma schema、迁移、seed 和生成检查。
4. 共享 schema 与领域函数测试。
5. 服务层持久化测试。
6. API route 边界测试。
7. 前端 client 和页面业务状态测试。
8. 完整命令矩阵。
9. 日志复核和缺陷修复回归。

理由：数据库和共享类型错误会放大到所有上层；先跑 UI 或 build 容易得到噪音结果。

### 2. 旧命名残留是阻断项

以下残留默认视为阻断问题，除非位于归档 OpenSpec 文档、历史迁移文件说明或明确的测试断言中：

- `WorkoutPlan`
- `WorkoutPlanDay`
- `WorkoutPlanItem`
- `WorkoutSession`
- `SavedWorkout`
- `ScheduledWorkout`
- `ScheduleStatus`
- `planId`
- `/api/workouts`
- `/api/workout-sessions`

理由：本次重构目标之一是删除旧概念。残留命名会继续误导后续实现，不能只靠注释解释。

### 3. 自动化测试分层补齐

测试不只新增一两个 happy path。至少覆盖：

- Zod schema：routine、routine item、schedule、session result 的合法与非法请求。
- 服务层：userId 隔离、routine CRUD、schedule CRUD、休息日、完成 result 事务、非法 exerciseId。
- API route：新路径、请求校验失败、资源不存在、跨用户拒绝、成功响应结构。
- Client API：请求路径、请求体、错误映射、事件通知。
- AI 草稿保存：多日草稿拆成多个 routine，排期生成多个 schedule，不创建计划外壳。
- 训练执行：`scheduleId` 加载、完成提交 result、失败不回滚本地完成态、已完成 schedule 再打开仍待开始。

### 4. 日志排查用于定位运行时问题

如果出现终端报错、编译失败、启动失败或运行时报错，必须读取 `codex_logs/error_log.js`。如果问题涉及 AI 草稿、chat 触发、AI 计划生成或保存来源不符合预期，必须读取 `codex_logs/ai_trace_log.js`。

理由：仓库已有 dev log 分流，真实日志比猜测调用链可靠。

### 5. 缺陷修复必须闭环

每个 bug 记录至少包含：

- 现象。
- 根因。
- 修复位置。
- 新增或更新的测试。
- 重新运行的验证命令。
- 剩余风险。

不能只把失败命令改到通过；如果失败暴露模型边界错误，应回到模型、schema、服务或 API 层修正。

## Risks / Trade-offs

- **排查范围过大导致任务拖延** → 使用分层门禁，每层先清零阻断问题，再进入下一层。
- **旧命名扫描误报历史文档** → 允许归档文档和旧迁移文件保留历史名，但当前源码、当前 docs、当前 tests 不允许保留旧语义。
- **单元测试 mock 掩盖真实 Prisma 问题** → Prisma validate、db generate、seed 和必要的集成式服务测试必须一起运行。
- **构建通过但业务流断裂** → 必须覆盖动作编排、日历安排、AI 草稿保存、训练执行、训练结果写入五条主链路。
- **浏览器验证边界不清** → 默认不主动打开浏览器；只有自动化检查无法覆盖真实页面运行时、hydration 或交互问题时，先说明原因并等待确认。

## Execution Plan

1. 确认 `refactor-workout-data-model` 的 tasks 已完成，且该 change 的 OpenSpec 校验通过。
2. 执行静态旧命名扫描，清理当前源码、测试、文档中的旧语义残留。
3. 验证 Prisma 层：`npx prisma validate`、`npm run db:generate`、按实现要求运行迁移或 reset、`npm run db:seed`。
4. 执行自动化测试：先定向跑新增/相关测试，再运行 `npm test`。
5. 执行静态检查：`npm run typecheck`、`npm run lint`。
6. 执行构建检查：`npm run build`。
7. 针对失败项读取日志、定位根因、修复并补测试。
8. 全部修复后重新运行完整命令矩阵。
9. 输出最终排查报告，包含命令结果、bug 清单、修复摘要和未覆盖风险。

## Open Questions

- 是否需要为数据库重建后增加一个临时诊断脚本，输出 routine、schedule、result、exercise 的记录数？当前建议如果测试不足以覆盖 seed 结果，再在实现阶段加轻量脚本。
- 如果 `npm run build` 因环境权限问题失败，是否接受 `npm run typecheck` + `npm test` + 具体失败日志作为临时验收？当前建议必须记录为剩余风险。
