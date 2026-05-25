## Why

`/training` 当前在缺少 `planId` 时会自动选择一个 planned 训练或 fallback 训练，导致调试页面和用户真实训练页面可能不是同一份计划。同时训练执行页把 `completed` 状态用于控制开始按钮显示，导致已完成训练再次进入时显示暂停而不是开始。

本次变更收紧训练执行页入口契约：必须从明确的训练安排进入；训练是否完成只属于计划/日历状态，不应影响前端当前这次训练执行流程。

## What Changes

- `/training` 必须携带 `planId` 查询参数。
- 缺少 `planId` 时，训练执行页展示明确错误/返回入口，不再自动选择默认训练或 fallback 训练。
- `plan.status === "completed"` 不再阻止训练执行页进入待开始状态。
- 已完成训练再次进入 `/training?planId=...` 时仍从第一个步骤展示“开始”，点击后按当前训练流程重新执行。
- 训练完成写回状态仍保留，但写回后的状态不影响用户再次开始训练。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workout-session-step-flow`: 训练执行页入口必须基于显式 `planId`，并且训练完成状态不得影响当前前端训练步骤执行。

## Impact

- 影响 `features/workouts/components/workout-session-page.tsx` 的加载逻辑、错误状态、开始按钮条件和状态标签。
- 移除训练执行页的默认 planned/fallback 自动选择行为。
- 不改变 `/plans` 到 `/training?planId=...` 的入口，不改变训练计划生成、数据库结构或 API 契约。
- 需要通过类型检查、lint、测试和真实 Chrome 验证缺少 `planId` 与已完成训练重复进入的行为。
