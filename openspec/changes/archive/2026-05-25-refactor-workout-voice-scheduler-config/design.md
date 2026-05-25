## Context

`/training` 当前的语音播报由 `WorkoutSessionPage` 传入训练状态，再由 `useWorkoutVoiceBroadcast` 内多个 effect 分别处理步骤切换、准备倒计时、计时 beep 和计次提示。所有 speech 入口最终调用同一个 `startSpeech()`，而该函数开头固定执行 `cancelSpeech("replace:<reason>")`。这会让后发的低优先级提示取消正在播放的高优先级动作介绍。

真实验证中，点击开启语音后浏览器支持 `speechSynthesis`，也有 `zh-CN` voice；但 activation 播报刚开始就被 `repetition-count` 或 `preparation-countdown` 替换。Web Audio beep 独立于 speech，所以用户仍能听到滴滴声，误以为只有 beep 没有语音。

这次变更需要同时解决两个问题：修复语音任务互相抢占的根因，并把播报规则配置化，让后续调整文案、间隔、等待时间和 fallback 参数时不需要改 hook 内部逻辑。

## Goals / Non-Goals

**Goals:**

- 将语音播报重构为统一的会话调度器，明确管理队列、优先级、取消、去重和完成事件。
- 保证动作准备提示、步骤切换提示、准备倒计时、计次提示和 beep 的关系可预测。
- 保证点击开启语音后，当前动作介绍不会被后续计次或倒计时立即抢断。
- 通过配置文件集中定义播报文案模板、speech 参数、beep 参数、准备倒计时、计次节奏和超时降级参数。
- 保持训练流程可用：语音失败、浏览器阻止或不支持时，不阻塞计时、自动推进和视觉提示。
- 增加测试覆盖，特别是现有测试未覆盖的 hook/调度器竞态。

**Non-Goals:**

- 不新增服务端 TTS、AI 音频、麦克风、语音识别或音频持久化。
- 不改变训练计划生成、动作推荐、timeline 生成、数据库结构或 API 契约。
- 不把语音播报扩展到 `/plans`、`/composer` 或动作库页面。
- 不让普通用户在 UI 中编辑开发者配置；本次配置面向开发者和代码维护。

## Decisions

### 1. 引入语音会话调度器，而不是继续扩展 hook effect

新增独立的语音会话调度模块，例如 `features/workouts/voice/workout-voice-session.ts`，负责维护：

- `preferenceEnabled`
- `supported`
- `activationState`
- `currentJob`
- `queue`
- `activeStepKey`
- `lastSpokenCueKeys`
- `audioContextState`

`useWorkoutVoiceBroadcast` 可以保留为 React 适配层，但不再直接在多个 effect 中调用 `speechSynthesis.speak()`。页面只向 hook/控制器提交事件，例如 `activate`、`stepChanged`、`preparationCountdownChanged`、`repetitionChanged`、`pause`、`resume`、`skip`、`finish`。

理由：现有问题来自多个 effect 共享抢占式 `startSpeech()`。继续加 if 条件会让竞态更隐蔽；调度器可以用领域事件统一决定排队、忽略、合并或取消。

备选方案是在 `startSpeech()` 增加 `cancelCurrent?: boolean`。这个方案改动更小，但仍保留调用方分散决策，不利于新增配置和测试全链路竞态。

### 2. 使用优先级和任务策略定义播报关系

语音任务应至少分为以下类型：

- `activation`: 用户点击开启后的激活提示和当前步骤提示。
- `step-intro`: 当前步骤或休息步骤介绍。
- `preparation-intro`: 动作准备介绍。
- `preparation-countdown`: “3，2，1，开始”。
- `rep-count`: 计次数字。
- `beep`: 计时动作节奏提示音。

调度策略：

- `activation`、`preparation-intro`、`step-intro` 是高优先级 speech，不能被 `rep-count` 或 `preparation-countdown` 抢断。
- `preparation-countdown` 必须在准备介绍完成后按配置节奏排队播放。
- `rep-count` 是低优先级短提示；如果当前高优先级 speech 正在播放，应按配置选择排队、跳过或合并，默认不抢断。
- 步骤切换、用户跳步、关闭语音、离开页面可以取消旧步骤任务。
- beep 不进入 speech 队列，只依赖已激活的 Web Audio session 和配置节奏。

理由：用户最关心的是动作说明和训练节奏。数字计次和 beep 是辅助信息，不能破坏动作介绍。

### 3. 用配置文件定义播报规则

新增配置文件，例如 `features/workouts/config/workout-voice-broadcast-config.ts`，导出 `workoutVoiceBroadcastConfig` 和相关类型。配置应覆盖：

- speech voice：`lang`、`rate`、`pitch`、`volume`、中文 voice 选择策略。
- 文案模板：开启提示、动作准备、步骤介绍、休息提示、下一组提示、倒计时、计次数字。
- 队列策略：各 cue type 的优先级、是否可抢占、是否可排队、最大队列长度、过期时间。
- 时间参数：准备介绍失败等待、speech fallback 最短/最长时间、每字符估算时间、倒计时间隔、计次播报最小间隔、beep 间隔、beep 音量/频率/时长。
- 降级策略：speech 失败时是否进入视觉倒计时、失败后是否保留重试状态、Web Audio 失败是否静默忽略。

配置必须是强类型对象，并在运行时用轻量校验或构造函数保证数字区间合理。默认配置应完全复现当前产品意图，但允许开发者后续调整规则。

### 4. 语音文案生成保持纯函数

`lib/shared/workouts/voice-cues.ts` 应继续承担纯文本生成职责，但输入应包含配置模板和 timeline step。不要从 UI 文案反推语音内容，不要在 hook 内拼接长句。

理由：语音规则应该可测试、可配置，并与 React 生命周期解耦。

### 5. 训练状态推进只依赖明确事件

训练准备阶段仍由 `WorkoutSessionPage` 拥有事实状态，例如 `preparedStepKey`、`preparationCountdownStepKey`。语音调度器只发出明确事件：

- `preparationIntroCompleted(stepKey)`
- `speechFailed(stepKey, reason)`
- `voiceActivated()`
- `voiceNeedsActivation()`

页面根据这些事件推进视觉倒计时或失败降级。调度器不能直接修改训练步骤索引或计时器。

理由：训练状态和语音播放状态职责不同。语音失败不能破坏自动推进，也不能让旧步骤回调推进新步骤。

## Risks / Trade-offs

- [Risk] 重构范围比补丁大，可能影响暂停、跳步、刷新恢复、动作详情等路径。→ Mitigation: 先实现可测试调度器，再接入页面；保留现有 UI 状态文案和按钮入口。
- [Risk] Web Speech API 在不同浏览器的事件顺序不一致。→ Mitigation: 继续使用 job id、fallback timer 和显式失败状态，不把 `onstart` 作为唯一事实来源。
- [Risk] 配置过度灵活会让规则难以理解。→ Mitigation: 配置只暴露训练语音规则需要的字段，提供强类型默认配置和注释，不支持任意脚本回调。
- [Risk] 低优先级计次提示排队过多会滞后。→ Mitigation: 默认给 `rep-count` 设置过期时间和最小间隔，过期则跳过，不追播旧数字。
- [Risk] beep 与 speech 独立后仍可能让用户误解为语音正常。→ Mitigation: voice state 只由 speech 激活和错误状态决定，beep 成功不能把 speech 标为 active。

## Migration Plan

1. 新增默认语音规则配置和类型，保留当前文案语义。
2. 新增语音任务模型和调度器，先用单元测试覆盖队列、优先级、取消、过期、失败降级。
3. 将 `useWorkoutVoiceBroadcast` 改为 React 适配层，接入调度器事件和配置。
4. 修改 `WorkoutSessionPage`，只向语音层发送训练事件，并通过回调推进准备倒计时。
5. 删除旧的抢占式 `startSpeech()` 多 effect 结构，避免双实现长期并存。
6. 扩展测试：配置校验、hook 调度竞态、训练流转与语音事件结合。
7. 使用现有 `http://localhost:3000` 通过 Chrome DevTools MCP 手动验证，不主动启动 dev server。

回滚策略：如果新调度器接入出现严重回归，可保留配置和文案纯函数，临时恢复旧 hook 的外部接口；但不应恢复多个 effect 直接抢占 speech 的内部结构。

## Open Questions

无需要产品确认的问题。默认配置先按当前产品语义实现，后续开发者可通过配置文件调整具体文案和时间参数。
