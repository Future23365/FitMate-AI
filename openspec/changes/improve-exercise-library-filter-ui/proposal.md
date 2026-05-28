## Why

动作库筛选区当前把大多数维度放进下拉框，视觉层级单一，用户需要反复打开菜单才能完成常用筛选。肌群作为高频筛选已经外露，但和其他筛选控件形态割裂，整体扫描和操作效率都不够好。

## What Changes

- 将动作库的高频筛选维度统一为 chip 筛选区，优先外露肌群、分类、器械和目标。
- 将低频筛选维度收纳进“更多筛选”面板，覆盖难度、居家条件、发力、机制、风险和状态。
- 增加已选筛选条件的可见 chip 列表，支持单项移除和清除全部。
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
