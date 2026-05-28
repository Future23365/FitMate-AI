## Context

当前项目已有多处右侧抽屉式弹窗：

- `ExercisePreviewSheet` 被聊天动作推荐卡、动作编排页、计划卡片和训练页复用，负责动作详情内容，也内置了 portal、遮罩、动画、滚动锁定和 `drawer-open` 页面缩放逻辑。
- 动作库页面的筛选抽屉在 `exercise-library-page.tsx` 内部实现了另一套 portal、遮罩、动画和滚动锁定逻辑。
- 训练页还存在语音设置弹窗等使用同一批 drawer 全局动画类的弹窗，但不是右侧抽屉形态。

这说明“右侧抽屉外壳”已经成为跨页面 UI 基础能力，但目前还没有独立组件承载。业务内容组件自己处理弹出外壳，会导致修复层级、动画或滚动锁定时需要多处同步。

## Goals / Non-Goals

**Goals:**

- 抽离一个公共右侧抽屉弹出组件，统一 portal、遮罩、动画、关闭时序、ESC/遮罩关闭、滚动锁定和 `drawer-open` 联动。
- 让动作详情抽屉和动作库筛选抽屉都基于公共右侧抽屉外壳实现。
- 保留动作详情、筛选表单和调用方现有业务状态，不改变 API、数据结构或用户流程。
- 让后续新增右侧抽屉只关注内容区，不重复实现弹出外壳。

**Non-Goals:**

- 不重做动作详情内容布局、图片播放、动作步骤或主操作按钮。
- 不改变动作库筛选维度、筛选参数、分页或排序语义。
- 不把居中弹窗、移动端侧边导航或非右侧抽屉形态强行迁移到该组件。
- 不调整全局 `drawer-open` 缩放视觉策略，只统一正确挂载位置和使用方式。

## Decisions

- 新增 `RightDrawer` 组件，建议放在 `components/app/right-drawer.tsx` 或同级 app shell 组件目录。它是 UI 外壳组件，不依赖动作、训练或筛选领域类型。
- `RightDrawer` 对外暴露 `isOpen`、`onClose`、`children`、可选 `title`/`subtitle`/`leadingIcon`/`footer`/`widthClassName`/`panelClassName` 等组合能力。业务组件可以传入完整 header/content/footer，也可以使用默认结构。
- `RightDrawer` 内部使用 `createPortal(..., document.body)`，避免被 `#app-content-wrapper` 的 `drawer-open` 缩放影响。相比让调用方自行 portal，这能从组件边界上消除层级错误。
- `RightDrawer` 内部复用现有 `drawer-backdrop-transition` 和 `drawer-panel-transition`，并负责关闭后延迟卸载。相比只抽 className，组件级封装能统一打开/关闭时序。
- `RightDrawer` 内部统一管理 `document.body.style.overflow` 和 `body.drawer-open`。调用方不再直接操作 body，避免多个右侧抽屉实现互相覆盖。
- 将 `ExercisePreviewSheet` 拆成“动作详情内容 + RightDrawer 外壳”：动作图片预加载、自动播放、步骤和主操作仍留在动作详情组件内，portal/遮罩/动画迁移到 `RightDrawer`。
- 将动作库 `FilterDrawer` 改为 `RightDrawer` 的内容组件，只保留筛选字段、已选 chips 和 footer 操作。

## Risks / Trade-offs

- 多个抽屉同时打开可能竞争 body 滚动锁定和 `drawer-open` 类 → 初期要求同一页面只打开一个右侧抽屉；组件内部清理必须可靠，后续如需并发再引入计数器。
- `RightDrawer` 过度参数化会变成难维护的万能组件 → 只抽外壳能力，业务 header/content/footer 仍允许由调用方组合。
- 动作详情抽屉当前客户端挂载逻辑较多，迁移时容易引入闪烁 → 保留现有“客户端挂载后常驻 portal”的时序语义，并用自动化检查覆盖打开/关闭状态类名。
- 动作库筛选抽屉宽度和背景色与动作详情不完全一致 → `RightDrawer` 提供宽度和面板 className 插槽，但动画、portal 和遮罩保持一致。

## Migration Plan

1. 新增公共 `RightDrawer` 组件，并为打开/关闭、portal 挂载、ESC/遮罩关闭和延迟卸载补充组件级测试或可验证用例。
2. 迁移 `ExercisePreviewSheet` 到 `RightDrawer`，保持对外 props 不变，确保动作编排页、计划卡片、聊天推荐卡和训练页无需重写业务调用。
3. 迁移动作库筛选抽屉到 `RightDrawer`，删除页面内重复的 portal、body class 和过渡时序代码。
4. 清理重复的抽屉外壳逻辑，保留全局 CSS 过渡类作为公共组件的实现细节。
5. 运行 TypeScript、ESLint、相关测试和 OpenSpec 校验。
