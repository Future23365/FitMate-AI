## Context

`/training` 的训练中页面已经通过 `buildWorkoutTimeline()` 得到可执行步骤，并维护 `activeStepIndex`、`remainingSeconds`、`isPaused`、`currentItem` 等状态。页面顶部也已有音量按钮和 `isAudioOn` 状态，但目前只影响按钮样式，没有实际音频输出。

这次改动应作为训练执行页的客户端辅助层，不改变训练计划生成、保存、排期、AI 编排或服务端 API。语音内容来自现有 workout timeline 和动作数据，倒计时提示音在浏览器本地生成。

## Goals / Non-Goals

**Goals:**

- 进入 `/training` 后默认开启语音播报并自动发声。
- 复用顶部音量按钮作为语音播报开关，并将用户选择保存到 `localStorage`。
- 在训练开始前播报动作概览和“3，2，1开始”。
- 在动作或休息步骤切换时播报当前动作、组数目标和下一组动作。
- 在倒计时关键阶段播放短促“嘟嘟声”提示音。
- 在暂停、继续、跳步、结束训练、离开页面时正确取消或重置正在排队的播报。
- 在不支持 Web Speech API 或浏览器限制发声时保持页面可用，不阻塞训练流程。

**Non-Goals:**

- 不接入 AI，不生成动态教练建议。
- 不做语音识别、语音命令或麦克风权限。
- 不新增服务端 TTS、音频文件存储或服务端偏好持久化。
- 不在 `/plans`、`/composer` 或动作库页面增加播报。
- 不改变训练计划数据模型、API 契约、Prisma schema 或 AI prompt。

## Decisions

### 1. 语音播报封装为训练页专用客户端 hook

新增训练语音 hook，例如 `useWorkoutVoiceBroadcast()`，由 `WorkoutSessionPage` 传入当前 timeline 状态、开关状态、暂停状态和控制事件。hook 内部负责访问 `window.speechSynthesis`、生成 `SpeechSynthesisUtterance`、取消队列和播放倒计时提示音。

备选方案是在 `WorkoutSessionPage` 内直接写多个 `useEffect`。不采用，因为训练页已经承担倒计时、计划加载和 UI 展示，继续散写浏览器音频副作用会让状态边界变得不清晰，也不利于后续测试提示文案。

### 2. 播报文案使用纯函数生成

新增纯函数，例如 `buildWorkoutVoiceCue()`，根据 `WorkoutTimelineStep`、当前步骤索引、剩余秒数和下一动作生成中文文案。hook 只负责调度，不负责拼业务文案。

备选方案是把文案直接拼在 hook 或 JSX 中。纯函数更适合单元测试，且能保证动作步骤、休息步骤、计时和计次模式使用统一语言。

### 3. 训练开始使用一次性启动序列

当 `/training` 载入有效 timeline 且语音开关开启时，播报动作概览，然后播报“3，2，1开始”。启动序列只在当前训练会话首次进入时触发；用户手动跳步或计划数据重新加载时不应重复播放完整概览，除非重新进入页面。

动作概览只播报主要动作名称，避免长计划一次性朗读过多内容。可限制为前若干个动作并提示总数量，例如“本次训练 6 个动作：开合跳、深蹲、俯卧撑……准备开始”。

### 4. 步骤切换以 timeline 为事实来源

动作步骤播报当前动作、组序号和目标，例如“开始深蹲，第 2 组，目标 45 秒”。休息步骤播报休息类型、时长和下一动作，例如“组间休息 30 秒，下一组动作深蹲”。

不从 UI 文案反推播报内容，避免展示层变更影响语音逻辑。所有步骤语义以 `WorkoutTimelineStep` 的 `type`、`reason`、`item`、`setIndex`、`totalSets`、`durationSeconds`、`nextItem` 为准。

### 5. 倒计时“嘟嘟声”与语音朗读分开

语音播报使用 Web Speech API 的 `speechSynthesis` 和 `SpeechSynthesisUtterance`。倒计时提示音使用浏览器本地音频能力生成短促 beep，例如 Web Audio `AudioContext` 振荡器；如果浏览器不支持或被限制，则跳过提示音，不影响语音播报或训练计时。

备选方案是朗读“嘟”或引入音频文件。朗读“嘟”效果不可控且会占用语音队列；音频文件会增加资源管理成本。用本地短音更符合倒计时反馈。

### 6. 默认开启，但尊重本地关闭偏好

默认状态为开启。首次进入 `/training` 且 `localStorage` 没有保存关闭偏好时自动尝试播报。用户点击顶部音量按钮关闭后，写入本地键，例如 `fitmate.workoutVoiceBroadcast.enabled=false`；再次进入训练页时读取这个本地偏好。

如果 `localStorage` 不可用，降级为当前 React state，不影响页面运行。

### 7. 取消策略优先于暂停队列

当用户暂停训练、跳到上一步/下一步、关闭播报、完成训练或离开页面时，调用 `speechSynthesis.cancel()` 清理队列。继续训练时根据当前步骤重新播报必要提示。

不依赖 `speechSynthesis.pause()` / `resume()` 保存队列，因为训练状态可能已经变化，保留旧队列容易产生过期播报。

## Risks / Trade-offs

- 浏览器可能限制自动发声或需要用户手势 → 默认仍尝试自动播报；若失败，训练流程保持可用，用户可点击音量按钮再次开启。
- 不同系统中文语音质量和可用 voice 不一致 → 默认设置 `lang="zh-CN"`，优先选择中文 voice，没有则使用浏览器默认 voice。
- 语音队列滞后导致播报旧动作 → 所有步骤切换、跳步、暂停和关闭动作都先取消队列，再播报当前状态。
- 倒计时 beep 可能和语音重叠 → beep 只在关键秒数触发，语音播报避免在最后数秒重复插入长句。
- 计划很长时动作概览过长 → 概览限制动作数量并提示总数，详细提示留给每个步骤切换。
- 测试环境没有真实 `speechSynthesis` → 文案生成函数单测覆盖业务语义，hook 测试 mock 浏览器 API，页面验证关注开关状态和调用路径。
