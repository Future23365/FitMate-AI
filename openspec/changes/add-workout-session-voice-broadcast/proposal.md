## Why

训练中页面目前已经有音量按钮和完整的训练执行状态，但缺少真实语音反馈。用户训练时通常不方便一直看屏幕，语音播报可以在动作切换、开始准备和训练执行节奏中提供更直接的提示。

## What Changes

- 在 `/training` 训练中页面增加客户端语音播报能力，使用浏览器 Web Speech API。
- 复用顶部音量按钮作为语音播报开关。
- 语音播报默认开启并自动发声；用户关闭后可保存到 `localStorage`，不做服务端持久化。
- 播报训练开始准备提示，包括“第一个动作：xxx”，然后播报“3，2，1”，倒计时结束后才开始训练计时。
- 播报动作切换提示，包括当前动作、组数目标和“下一组动作”。
- 计时动作执行期间每秒播放“嘟”声，作为动作节奏提示。
- 按次动作执行期间按动作节奏播报数字计数，例如“1，2，3...”，直到达到目标次数。
- 不接入 AI，不做语音识别，不新增服务端 TTS。
- 不在 `/plans` 和 `/composer` 做播报；只有进入 `/training` 后生效。

## Capabilities

### New Capabilities

- `workout-session-voice-broadcast`: 覆盖训练中页面的语音播报开关、默认发声、训练流程播报、计时动作每秒提示音、按次动作数字计数和本地偏好保存。

### Modified Capabilities

- None.

## Impact

- 影响 `features/workouts/components/workout-session-page.tsx` 的训练执行页面交互。
- 可能新增训练语音播报相关 hook / utility，用于封装 Web Speech API、提示音播放、播报文案生成和本地偏好读取。
- 复用现有 `buildWorkoutTimeline()` 输出的训练步骤，不改变训练计划数据结构、API 契约、AI 编排、数据库或持久化服务。
- 不新增第三方依赖；依赖浏览器内置 `window.speechSynthesis`、`SpeechSynthesisUtterance` 和 Web Audio / HTML Audio 可用性。
