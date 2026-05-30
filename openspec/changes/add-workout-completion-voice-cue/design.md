## Context

`/training` 当前通过 `WorkoutVoiceSession` 统一管理动作准备、倒计时、休息提示、计次提示和 beep。训练完成时，`WorkoutSessionPage.completeWorkoutSession()` 会调用 `voiceSession.cancelCurrentVoice("session-complete")` 清理旧语音任务，然后进入完成态并异步保存训练结果。这个流程避免旧语音继续播放，但没有排入新的完成提示。

语音文案和调度策略已经集中在 `lib/shared/workouts/voice-broadcast-config.ts`，页面组件不应直接拼接口播文本。训练完成提示也应遵守这个边界。

## Goals / Non-Goals

**Goals:**

- 训练完成时，在语音播报已启用且页面语音已激活时，播报“本次训练已完成”。
- 完成播报优先级高于步骤、倒计时、计次等旧提示，并在完成时先清空旧队列。
- 完成提示文案和调度策略纳入现有语音配置和类型系统。
- 补充自动化测试覆盖配置和语音 session 行为。

**Non-Goals:**

- 不改变训练完成状态机、训练结果保存 API 或完成页视觉。
- 不要求语音未启用、浏览器不支持或页面语音未激活时自动播放完成提示。
- 不新增服务端音频、AI 生成语音、麦克风或第三方语音依赖。

## Decisions

1. 新增 `session-complete` cue 类型，而不是复用 `activation` 或 `step-intro`。
   - 理由：完成提示有独立语义和优先级，需要明确的 dedupe key、reason 和配置策略。
   - 取舍：会增加一个 cue 类型，但比把完成文案塞进页面或复用不相关类型更清晰。

2. 在 `WorkoutVoiceSession` 暴露 `announceSessionComplete()`。
   - 理由：页面只表达“训练完成了”，具体是否能播、如何排队、如何降级由语音 session 决定。
   - 取舍：hook 会增加一个窄接口，但可以避免页面直接调用底层 speech job。

3. 完成流程先取消旧语音任务，再调度完成 cue。
   - 理由：旧步骤提示、计次或倒计时不应在训练结束后继续播，也不应排在完成提示前。
   - 取舍：如果完成前正有提示在播，会被打断；这是完成态比步骤提示更高优先级的预期行为。

4. 完成提示只在语音偏好开启且页面语音已激活时播放。
   - 理由：Web Speech 受浏览器用户手势限制，训练结束通常不是新的用户激活事件；未激活时强行播放容易失败并产生误导状态。
   - 取舍：如果用户没有开启或激活语音，仍只有视觉完成反馈。

## Risks / Trade-offs

- [Risk] 完成提示可能被浏览器阻止或 speech 事件不返回。→ Mitigation: 复用现有 speech fallback 和失败状态，不能阻塞完成态或结果保存。
- [Risk] 完成时取消旧语音会打断当前动作提示。→ Mitigation: 训练已经结束，完成提示优先于旧步骤提示。
- [Risk] 新增 cue 类型后忘记配置策略会造成运行时异常。→ Mitigation: TypeScript 类型和配置校验测试覆盖默认配置。
