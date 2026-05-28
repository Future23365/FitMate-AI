## Why

动作编排页的主要任务是编辑当前编排，但当前首屏被大标题、说明文案、已保存编排列表和摘要卡片占用过多纵向空间。用户需要向下滚动才能充分看到热身、训练、拉伸动作区，页面更像管理页而不是编排工作台。

## What Changes

- 将动作编排页顶部改为紧凑工作台栏：当前编排名称、核心指标和主操作在同一行或紧凑换行内展示。
- 将“已保存编排”从常驻大 section 改为按钮下拉，默认不占用主编排区纵向空间。
- 移除独立的大标题、副标题和大摘要卡片，把首屏空间让给动作编排区。
- 保持右侧动作库位置和已有动作筛选逻辑不变。

## Capabilities

### New Capabilities
- `composer-workbench-layout`: 动作编排页作为高密度工作台展示当前编排和已保存编排入口。

### Modified Capabilities

## Impact

- 影响 `features/workouts/components/action-composer-page.tsx` 的页面信息架构和局部交互。
- 不改变 workout routine 数据结构、API 契约、动作库筛选逻辑或训练执行逻辑。
- 需要使用类型检查验证 JSX 状态和事件处理正确。
