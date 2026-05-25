## Context

训练执行页当前有两个互相放大的状态问题：

- `getPlanFromDatabase(planId)` 在 `planId` 为空时会调用 `listScheduledWorkouts()`，选择第一个 planned 训练；如果没有匹配计划，又返回 fallback 训练。
- `isAwaitingStart` 使用 `plan.status !== "completed"` 判断是否显示开始按钮。

这会造成调试和真实用户路径不一致：开发验证不带 `planId` 时打开的是默认训练，而用户从训练计划进入时可能带的是已完成 `planId`。已完成计划会绕过待开始状态，页面显示暂停按钮，但内部 `hasStarted=false`，语音和训练推进状态不一致。

## Goals / Non-Goals

**Goals:**

- `/training` 必须依赖显式 `planId` 加载训练安排。
- 缺少 `planId` 时不展示训练执行 UI，不启动语音状态机，不选择默认训练。
- 已完成训练安排再次进入训练页时，仍显示待开始状态和开始按钮。
- 当前前端训练执行状态由页面内 `hasStarted`、`isPaused`、步骤索引和倒计时决定，不由持久化 `plan.status` 决定。

**Non-Goals:**

- 不改变训练计划列表、日历页或计划生成逻辑。
- 不改变数据库 schema、API route 契约或权限校验。
- 不新增训练历史版本或多次训练记录模型。
- 不改变训练完成时写回 `completed` 的行为。

## Decisions

### 1. 删除 `/training` 的默认训练选择

`getPlanFromDatabase` 改为只接受非空 `planId`，只调用 `getScheduledWorkout(planId)`。如果缺少 `planId`、加载失败或训练项目为空，页面展示错误状态和返回 `/plans` 的入口。

继续保留组件内部初始 shell 数据仅用于 React 首次渲染的类型安全，但它不能作为实际训练数据展示；训练 UI 必须在 `isPlanReady` 后渲染。

### 2. `completed` 不参与训练执行 UI 分支

`isAwaitingStart` 改为只由 `isPlanReady && !hasStarted` 决定。状态标签也优先展示当前执行态：待开始、已暂停、准备中、进行中。`plan.status` 只作为训练计划持久化状态，不再阻止开始按钮。

### 3. 语音状态随当前执行态，不随完成状态

语音 hook 继续由 `isSessionStarted` 控制调度。已完成计划重复进入时，`hasStarted=false`，所以语音不会自动启动；点击开始后才尝试语音激活。

## Risks / Trade-offs

- [Risk] 直接访问 `/training` 的旧入口不再进入 fallback 训练。→ Mitigation: 展示明确错误和返回训练计划页入口。
- [Risk] 已完成计划重复训练会再次允许开始。→ Mitigation: 这是本次目标；当前阶段先把执行页作为一次本地训练流程，不把完成状态作为禁用条件。
- [Risk] 初始 shell 数据仍存在，容易被误认为 fallback。→ Mitigation: 代码中实际渲染训练 UI 前检查 `isPlanReady`，缺少 `planId` 时不会展示 shell 数据。

## Open Questions

无。按当前需求实现：必须传 `planId`，完成状态不能影响训练执行页训练逻辑。
