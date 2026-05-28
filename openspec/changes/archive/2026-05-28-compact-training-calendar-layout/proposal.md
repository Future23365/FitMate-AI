## Why

训练日历页的核心任务是查看和安排月度训练，但当前首屏先展示标题区和“已保存计划”横向列表，导致月历主体被向下挤压，用户需要滚动才能看完整日历。

本次调整让月历成为页面主体，把已保存计划改为按需打开的排期素材入口，减少常驻信息对训练日历的干扰。

## What Changes

- 将训练日历页从“标题 + 已保存计划 + 月历”调整为紧凑工作台布局。
- 将“已保存计划”从常驻横向列表改为顶部工具栏中的按需打开入口。
- 月历区域在桌面端占据主内容剩余高度，默认展示完整月份网格。
- 日历单元格以更紧凑的信息密度展示当天安排，详情继续由右侧“当天计划”面板承载。
- 本次不适配移动端，不改变训练排期、状态更新、删除、开始训练或持久化 API 行为。

## Capabilities

### New Capabilities
- `training-calendar-layout`: 训练日历页以月历为主体展示，并通过按需入口管理已保存计划。

### Modified Capabilities

## Impact

- 影响 `features/workouts/components/training-plan-page.tsx` 的桌面布局、日历网格和已保存计划入口。
- 不改变 `/api/workout-routines`、`/api/workout-schedules` 或训练执行页契约。
- 不新增依赖，不改变 Prisma schema 或数据库迁移。
