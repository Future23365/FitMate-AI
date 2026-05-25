## Context

当前语音播报由 `WorkoutVoiceSession` 和 `useWorkoutVoiceBroadcast()` 驱动，训练页顶部音量按钮会触发正式调度器。用户环境出现的 `speech_blocked` 表示 `speechSynthesis.speak()` 已被调用，但浏览器没有在超时窗口内触发 `onstart`。与此同时，计时滴滴声可以播放，因为滴滴声使用 Web Audio，不代表 Web Speech API 可用。

如果继续只改正式调度器，容易把浏览器 Web Speech 启动失败、voice 列表加载、训练步骤状态和语音偏好混在一起。需要一个最小、独立、可重复触发的诊断路径。

## Goals

- 提供一个用户可点击的语音自检入口。
- 自检必须在用户点击同一个事件链路中直接调用 Web Speech API。
- 自检不改变训练状态、不写入语音偏好、不复用正式训练语音队列。
- 自检结果能回答：
  - 当前浏览器是否支持 `speechSynthesis` 和 `SpeechSynthesisUtterance`。
  - `getVoices()` 是否能返回 voice。
  - 系统选择了哪个 voice。
  - 是否收到 `onstart`、`onend`、`onerror`。
  - 是否因为超时被判断为 `speech_blocked`。

## Non-Goals

- 不引入服务端 TTS、AI 语音或音频文件。
- 不改变正式训练播报配置、播报文案或训练步骤推进规则。
- 不自动修复用户 Chrome 的系统级语音合成问题；本 change 先提供准确诊断路径。

## Design

### 独立 self-check helper

新增 `runWorkoutVoiceSelfCheck()`，放在 `features/workouts/voice/` 下。它只做一次最小语音合成：

1. 检查 `window.speechSynthesis` 和 `SpeechSynthesisUtterance`。
2. 读取 voice 列表；如果为空，等待一次 `voiceschanged` 或配置超时。
3. 选择中文 voice，找不到时使用默认 voice。
4. 直接创建一条短文本 utterance，例如“语音自检”。
5. 调用 `speechSynthesis.speak()`。
6. 用 `onstart/onend/onerror` 和启动超时生成结构化结果。

helper 只返回诊断结果，并通过 `onDiagnostic` 输出 `[WorkoutVoiceCheck]` 日志。它不调用 `WorkoutVoiceSession`，也不更新正式语音状态。

### 页面入口

在训练页右侧“训练控制”区域新增一个小型诊断区域：

- 按钮文案：`语音自检`
- 运行中：`检测中`
- 结果简短展示：
  - 成功：`语音自检通过`
  - 失败：`语音未启动`
  - 不支持：`浏览器不支持`
- 展示开发排障所需的 `voices`、`voice`、`events`、`reason`。

入口放在训练控制区域，而不是顶部音量按钮旁，避免用户把它误认为正式播报开关。

### 状态隔离

自检按钮不会：

- 调用 `setIsAudioOn()`。
- 写入 `fitmate.workoutVoiceBroadcast.enabled`。
- 调用 `voiceSession.activateCurrentStep()`。
- 推进 preparation countdown。
- 改变 `hasStarted`、`isPaused`、`activeStepIndex`。

## Risks

- 某些浏览器可能在 voice 列表为空时较慢返回。通过复用语音配置中的 voice load timeout 控制等待时间。
- `speechSynthesis.cancel()` 可能影响正在播报的正式训练语音。自检只在用户主动点击时执行；运行前取消浏览器 speech 队列以保证自检结果可解释，并在文案上把它作为诊断工具。

## Validation

- 单元测试覆盖 unsupported、start/end 成功、start timeout blocked、utterance error。
- 运行 `npm test`、`npm run typecheck`、`npm run lint`。
- 使用 Chrome DevTools MCP 打开 `/training?planId=...`，确认页面显示自检入口，点击后 console 输出 `[WorkoutVoiceCheck]` 日志且页面展示结果。
