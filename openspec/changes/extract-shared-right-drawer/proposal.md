## Why

当前右侧抽屉弹窗的 portal、遮罩、页面缩放、滚动锁定和滑入动画散落在多个组件里，动作详情、训练设置和动作库筛选已经出现实现分叉。继续让每个弹窗各自维护外壳逻辑，会增加层级异常、背景缩放误用和动画不一致的风险。

## What Changes

- 新增一个公共右侧抽屉弹出组件，统一负责 `document.body` portal、遮罩、右侧滑入/滑出动画、关闭时延迟卸载、ESC/遮罩关闭、背景滚动锁定和 `drawer-open` 页面缩放联动。
- 将动作详情抽屉改为基于公共右侧抽屉组件实现，保留现有动作图片、步骤、主操作按钮和业务状态逻辑。
- 将动作库页面的筛选动作抽屉改为基于公共右侧抽屉组件实现，保留现有筛选状态、查询参数和已选条件管理逻辑。
- 检查动作编排页面、计划卡片、训练页等使用动作详情抽屉的入口，确保它们继续复用动作详情内容组件，但外层弹出行为由公共抽屉承载。
- 不改变动作详情、动作筛选、训练编排、API、数据库或 AI 编排的业务语义。

## Capabilities

### New Capabilities

- `shared-right-drawer`: 约束右侧抽屉弹窗的公共外壳能力、portal 层级、动画、滚动锁定和调用方迁移边界。

### Modified Capabilities

- 无。

## Impact

- 影响 `features/exercises/components/exercise-preview-sheet.tsx`、`features/exercises/components/exercise-library-page.tsx` 以及新增的共享右侧抽屉组件文件。
- 影响使用 `ExercisePreviewSheet` 的动作编排、计划卡片、训练页和聊天动作推荐卡片，但调用方业务数据流应保持不变。
- 不涉及 `/api/exercises`、训练持久化 API、Prisma Schema、数据库迁移或模型输出结构。
