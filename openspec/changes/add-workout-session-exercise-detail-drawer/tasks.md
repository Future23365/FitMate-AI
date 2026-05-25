## 1. Implementation

- [x] 1.1 阅读 `WorkoutSessionPage` 和 `ExercisePreviewSheet` 的类型与状态边界，确认当前训练动作可直接复用共享抽屉。
- [x] 1.2 在训练执行页维护当前动作详情抽屉打开状态，并在当前动作不可展示时关闭抽屉。
- [x] 1.3 在左侧动作示范模块新增“动作详情”按钮，点击时设置 `isPaused` 并打开共享详情抽屉。
- [x] 1.4 确认抽屉关闭后保留暂停状态，不新增自动恢复逻辑。

## 2. Verification

- [x] 2.1 运行相关检查，确认 TypeScript、lint 或构建无新增错误。
- [x] 2.2 运行 OpenSpec 校验，确认 change 文档和规格有效。
