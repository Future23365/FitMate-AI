## Why

当前训练日历页把“已保存计划”入口放在顶部工具栏，并通过悬浮下拉展示计划列表。下拉展开时会覆盖月历、图例和训练摘要，视觉层级混乱；同时入口位置和实际排期目标之间的关系不够直接。

本次调整把已保存计划选择收敛到右侧选中日期详情栏中，让用户先选日期，再在该日期上下文内添加已保存计划。

## What Changes

- 从顶部工具栏移除“已保存计划”下拉入口。
- 在右侧选中日期详情栏增加“从已保存计划添加”入口。
- 点击入口后，右侧栏切换为已保存计划选择模式，展示可安排到当前选中日期的计划列表。
- 用户选择计划后，创建对应 `WorkoutSchedule`，并回到当前日期详情。
- 保留进入 `/composer` 管理全部计划的入口。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `training-calendar-layout`: 调整已保存计划按需展示的位置和交互，使其位于选中日期详情栏内，而不是顶部工具栏悬浮下拉。

## Impact

- 影响 `features/workouts/components/training-plan-page.tsx` 的顶部工具栏、右侧日期详情栏和已保存计划列表展示。
- 不改变 API、Prisma Schema、训练计划数据结构或持久化语义。
