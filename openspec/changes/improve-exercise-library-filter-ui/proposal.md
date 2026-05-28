## Why

动作库筛选区当前把大多数维度放进下拉框，视觉层级单一，用户需要反复打开菜单才能完成常用筛选。肌群作为高频筛选已经外露，但和其他筛选控件形态割裂，整体扫描和操作效率都不够好。

## What Changes

- 将动作库默认筛选区收敛为顶部紧凑工具栏，常驻搜索、筛选入口和已选数量。
- 将肌群、分类、器械、目标以及低频筛选统一收纳进筛选抽屉，避免默认页面挤压动作列表。
- 增加已选筛选条件的可见 chip 列表，支持单项移除和清除全部，并在工具栏中横向滚动展示。
- 将排序和每页数量从筛选流中分离，放到结果信息栏右侧。
- 不改变 `/api/exercises` 查询参数、分页语义、facets 数据结构或动作卡片展示逻辑。

## Capabilities

### New Capabilities

- `exercise-library-filter-ui`: 约束动作库页面筛选区的信息架构、核心筛选外露、更多筛选收纳、已选条件展示和结果工具栏布局。

### Modified Capabilities

- 无。

## Impact

- 影响 `features/exercises/components/exercise-library-page.tsx` 的筛选区 UI 结构和局部组件。
- 不涉及 API、数据库、Prisma Schema、AI 编排或动作筛选业务规则变更。
- 需要运行相关 TypeScript / ESLint 检查，并验证 OpenSpec change。
