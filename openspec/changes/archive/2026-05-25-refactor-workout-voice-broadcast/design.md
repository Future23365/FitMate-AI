## Context

`/training` 当前由 `features/workouts/components/workout-session-page.tsx` 管理训练 timeline、准备倒计时、暂停、跳步和顶部语音开关，由 `features/workouts/hooks/use-workout-voice-broadcast.ts` 直接访问 `window.speechSynthesis`、`SpeechSynthesisUtterance` 和 Web Audio。现有实现把本地偏好、浏览器能力、用户手势激活和真实播放状态混在一起：点击开关后即使浏览器没有真正开始播放，页面也可能显示已开启；刷新后本地偏好为开启时，也可能处于“看似开启但未被用户手势激活”的状态。

语音播报还参与训练准备流程：动作准备提示完成后才进入“3，2，1，开始”，倒计时结束后才正式训练。因此这次重构不能只修开关按钮，需要同时整理语音任务和训练状态推进之间的边界。

## Goals / Non-Goals

**Goals:**

- 建立明确的训练语音会话状态，区分 `unsupported`、`off`、`needs-activation`、`activating`、`active`、`speaking`、`failed` 等状态。
- 点击开启语音时，在用户手势同步链路内发起当前训练步骤播报，并用 `SpeechSynthesisUtterance` 事件确认播放结果。
- 刷新页面后，如果本地偏好为开启，页面明确进入等待激活状态，并在下一次有效用户手势中恢复当前步骤播报。
- 将动作准备提示、倒计时、步骤切换、计时 beep 和计次提示统一交给一个语音会话控制器管理，避免多个 effect 互相取消或覆盖。
- 语音失败时继续推进训练流程，但保留用户可见状态或开发日志，便于排查。

**Non-Goals:**

- 不改变训练计划生成、动作选择、timeline 生成、训练时长估算或数据库结构。
- 不新增 AI、麦克风、录音、服务端音频存储或第三方语音服务。
- 不把语音播报扩展到 `/plans`、`/composer` 或动作库页面。
- 不要求所有浏览器都能播放语音；不支持或被浏览器策略阻止时必须稳定降级。

## Decisions

### 1. 引入训练语音会话控制器

把 Web Speech API 和 Web Audio 访问收口到客户端控制器，例如 `createWorkoutVoiceSession()` 或 `useWorkoutVoiceSession()` 内部。页面传入当前 `WorkoutTimelineStep`、准备倒计时、暂停状态、用户动作和回调；控制器返回可渲染状态、错误原因和命令函数。

理由：当前页面状态 `isAudioOn`、`isVoiceAudioActive` 与 hook 内部 `activeSpeechJobRef` 分离，UI 无法知道真实播放是否开始。控制器可以统一维护当前 job id、当前 utterance、队列、取消原因和播放事件。

备选方案是在现有 hook 上继续补状态。这个方案改动小，但仍然保留多个 effect 竞争 `speechSynthesis.cancel()` 的结构，无法根治刷新恢复和点击后无声的问题。

### 2. 用户偏好不等于本页可播放

保留 `fitmate.workoutVoiceBroadcast.enabled` 作为用户偏好，但页面状态应拆成：

- `preferenceEnabled`: 用户是否希望训练页播报。
- `supported`: 当前浏览器是否存在 `speechSynthesis` 和 `SpeechSynthesisUtterance`。
- `activationState`: 当前页面是否已经通过用户手势完成播放激活。
- `playbackState`: 当前是否正在播报、排队、失败或空闲。

刷新页面后，若 `preferenceEnabled=true` 且 `supported=true`，状态应为 `needs-activation`，而不是直接显示“正在播报”。下一次用户点击音量按钮、播放/暂停按钮、跳步按钮或键盘操作时，控制器同步尝试播报当前步骤。

### 3. 第一次开启必须同步播报当前步骤

用户点击开启语音时，控制器应在同一个事件处理链路内创建 `SpeechSynthesisUtterance` 并调用 `speechSynthesis.speak()`，播报内容应是当前训练步骤的动作准备提示或当前步骤提示，而不是单独只播“语音播报已开启”。可以在播报前短提示状态，但不能只依赖这个提示来判断训练播报可用。

理由：浏览器对自动播放和语音合成的用户手势策略不完全一致，把第一次训练播报延迟到 `setTimeout` 或 React effect 后更容易被阻止。

### 4. 准备阶段由训练状态机推进，语音只负责完成信号

训练页面应继续拥有“当前步骤是否已准备完成”的事实状态，但进入准备倒计时的触发应来自一个明确事件：

- 语音开启且播放成功：动作准备提示 `onend` 后触发倒计时。
- 语音关闭：按无声准备延迟或立即进入视觉倒计时，但流程必须一致。
- 语音失败或不可用：记录失败状态，然后按无声路径进入倒计时。

这样可以避免播放失败时训练卡在“准备”，也避免未播报却提前显示已开启。

### 5. 队列和取消统一使用 job id

每次动作切换、跳步、暂停、关闭语音或离开页面时，控制器创建新的 job id 并取消旧 job。旧 utterance 的 `onend` / `onerror` 如果迟到，必须根据 job id 忽略，不能推进当前步骤。

计次提示只播新增次数；计时 beep 只在当前 job 仍有效且 Web Audio 已可用时播放。Web Audio 失败不影响 speech 和训练计时。

### 6. 可诊断但不打断训练

语音失败时，页面可以显示短状态，例如“语音未激活，点击音量按钮重试”或“当前浏览器阻止了语音播放”，并在开发环境输出带前缀的日志，例如 `[WorkoutVoice] speech error`。不弹阻塞式对话框，不请求麦克风权限。

## Risks / Trade-offs

- [Risk] 部分浏览器的 Web Speech API 行为不一致，`onstart` / `onend` / `onerror` 触发时机可能不同。→ Mitigation: 使用 job id、超时 fallback 和错误状态组合判断，不把单一事件作为唯一事实来源。
- [Risk] 刷新后偏好为开启但没有用户手势时无法自动发声。→ Mitigation: 明确展示 `needs-activation` 状态，并在下一次训练页面用户手势中恢复当前步骤播报。
- [Risk] 语音失败后仍推进训练可能让用户错过口播提示。→ Mitigation: UI 保持准备倒计时和当前动作清晰可见，并允许用户点击音量按钮重试当前步骤播报。
- [Risk] 重构会触及训练准备、跳步、暂停、计次和 beep 多条路径。→ Mitigation: 先提取可测试控制器，再替换页面接入，并补 mock Web Speech API 测试覆盖关键状态转换。

## Migration Plan

1. 新增或重写训练语音会话控制器，保留现有文案生成函数。
2. 将 `WorkoutSessionPage` 的语音状态从布尔值拆成偏好、支持、激活和播放状态。
3. 用控制器事件替换现有 `useWorkoutVoiceBroadcast` 中多个独立 effect 对 `speechSynthesis` 的直接调用。
4. 补充单元测试或轻量集成测试，mock `speechSynthesis`、`SpeechSynthesisUtterance` 和 Web Audio。
5. 验证关闭默认静音、点击开启、刷新后偏好开启、暂停、跳步、动作准备、计时 beep、计次播报和不支持语音的降级路径。

回滚策略：保留现有 `voice-cues.ts` 文案纯函数，若控制器接入出现不可接受回归，可临时恢复旧 hook 调用路径，但不保留双实现长期并存。

## Open Questions

无需要产品确认的问题。实现时如果发现特定浏览器无法可靠触发 `onstart`，应按“可诊断降级”原则处理，而不是阻塞训练流程。
