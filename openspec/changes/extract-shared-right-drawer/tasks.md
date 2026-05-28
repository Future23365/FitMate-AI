## 1. 公共组件抽离

- [ ] 1.1 新增公共 `RightDrawer` 组件，统一 `document.body` portal、遮罩、右侧滑入/滑出动画、关闭后延迟卸载和面板宽度配置。
- [ ] 1.2 将 ESC 关闭、遮罩关闭、背景滚动锁定和 `drawer-open` 页面联动收敛到 `RightDrawer` 内部。
- [ ] 1.3 为 `RightDrawer` 添加简短中文意图注释，说明它只负责右侧抽屉外壳，不承载业务内容。

## 2. 现有抽屉迁移

- [ ] 2.1 将 `ExercisePreviewSheet` 改为基于 `RightDrawer` 实现，保留现有对外 props、动作图片播放、步骤展示和主操作按钮。
- [ ] 2.2 确认聊天动作推荐卡、动作编排页、计划卡片、训练页继续通过 `ExercisePreviewSheet` 打开动作详情，调用方业务状态不变。
- [ ] 2.3 将动作库筛选抽屉改为基于 `RightDrawer` 实现，删除页面内重复的 portal、body class、滚动锁定和过渡时序代码。
- [ ] 2.4 清理重复的右侧抽屉外壳实现，只保留业务内容组件和公共 `RightDrawer` 外壳。

## 3. 验证

- [ ] 3.1 运行 `openspec validate extract-shared-right-drawer --strict`。
- [ ] 3.2 运行 `npx eslint` 覆盖新增公共组件、`ExercisePreviewSheet` 和动作库页面。
- [ ] 3.3 运行 `npm run typecheck`。
- [ ] 3.4 运行与动作详情、动作库筛选相关的自动化测试；如缺少直接测试，至少运行现有动作库服务测试并说明覆盖边界。
