## Why

训练完成态目前只更新页面视觉和持久化结果，会取消当前语音任务但不会播报完成提示。用户在训练结束时需要明确的听觉反馈，尤其是在不看屏幕时确认本次训练已经结束。

## What Changes

- 训练完成时，在语音播报已启用且本次页面语音已激活的情况下，播报“本次训练已完成”。
- 完成播报应先清理当前步骤、计次、倒计时等旧语音任务，避免旧提示覆盖完成提示。
- 完成播报文案和调度策略纳入现有语音播报配置，而不是直接写在页面组件里。
- 不改变训练完成状态机、训练结果保存接口、训练完成视觉反馈或非 `/training` 页面行为。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `workout-session-voice-broadcast`: 训练完成时需要播放一次完成语音提示，并继续遵守语音启用、激活、取消和降级规则。
- `workout-voice-rule-configuration`: 新增训练完成 cue 的文案模板和调度策略，使完成播报仍由集中配置维护。

## Impact

- 影响 `features/workouts/components/workout-session-page.tsx` 的完成训练流程。
- 影响 `features/workouts/hooks/use-workout-voice-broadcast.ts` 和 `features/workouts/voice/workout-voice-session.ts` 的语音 session API。
- 影响 `lib/shared/workouts/voice-broadcast-config.ts` 和 `lib/shared/workouts/voice-cues.ts` 的 cue 类型、模板和构造函数。
- 需要补充语音配置和语音 session 的单元测试。
