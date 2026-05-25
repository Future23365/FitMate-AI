## Why

训练执行页在部分 Chrome 环境中可以播放计时滴滴声，但 Web Speech 语音播报无法启动并出现 `speech_blocked`。当前页面只能标红语音按钮，开发者缺少一个不依赖训练调度器的最小自检路径来判断问题来自浏览器语音合成环境还是训练语音状态机。

## What Changes

- 在 `/training` 新增语音自检入口，用于开发者和用户主动检测当前浏览器的 Web Speech API 是否能在点击事件中直接启动中文语音。
- 自检路径独立于训练播报调度器，不改变训练开始、暂停、跳步、完成逻辑，也不写入语音播报偏好。
- 自检结果展示浏览器支持状态、voice 数量、选中的 voice、是否触发 `onstart/onend/onerror`、失败原因和关键耗时。
- 自检过程输出 `[WorkoutVoiceCheck]` 开发日志，方便用户把浏览器侧真实结果发给开发者排查。

## Capabilities

### New Capabilities

### Modified Capabilities
- `workout-session-voice-broadcast`: 增加训练页语音自检能力，要求自检与正式训练播报状态隔离，并暴露可诊断结果。

## Impact

- 影响 `features/workouts/voice/*`：新增独立语音自检 helper。
- 影响 `features/workouts/components/workout-session-page.tsx`：新增自检入口和结果展示。
- 影响测试：增加语音自检 helper 的单元测试，继续覆盖现有训练语音播报行为。
