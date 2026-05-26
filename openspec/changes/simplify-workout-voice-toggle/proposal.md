## Why

`/training` 现在进入页面后不会自动开始训练，用户必须点击开始按钮才会进入准备倒计时和语音激活。刷新后继续让语音按钮显示“重新点击恢复播报”会和新的手动开始流程重复，也让同一个按钮同时承担开关和重试两种含义。

## What Changes

- 将顶部语音按钮收敛为两态开关：语音关闭时点击开启，语音开启时点击关闭。
- 移除刷新后 `needs-activation` / `failed` 状态驱动的“启动语音播报”按钮语义和高亮重试提示。
- 保留开始按钮中的语音激活能力：用户点击开始训练时，如果语音偏好已开启，系统在该用户手势内尝试播报当前训练步骤。
- 保留语音设置弹窗和自检能力，用于诊断浏览器语音能力，不改变训练计时、准备倒计时、跳步或动作选择规则。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workout-session-voice-broadcast`: 调整训练页顶部语音按钮的交互语义，从“开启 / 关闭 / 重试激活”收敛为“开启 / 关闭”。

## Impact

- 影响 `features/workouts/components/workout-session-page.tsx` 中语音按钮 label、样式状态和点击处理。
- 影响训练语音相关单元测试，需覆盖偏好已开启但等待激活或失败时点击按钮会关闭语音。
- 不改变 `localStorage` key、语音设置结构、Web Speech API 调度器、训练步骤推进或数据库结构。
