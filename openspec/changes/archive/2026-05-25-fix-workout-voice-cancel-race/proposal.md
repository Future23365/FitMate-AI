## Why

用户在自己的 Chrome 中点击训练页语音自检时出现 `SpeechSynthesisUtterance.onerror` 的 `error: "canceled"`。Web Speech API 对该错误的语义是 `speechSynthesis.cancel()` 在 utterance 开始前把它从队列移除；当前代码在每次正式播报和自检 `speak()` 前都无条件执行 `cancel()`，会在部分 Chrome 环境触发队列取消竞态。

## What Changes

- 移除自检和正式语音 job 中 `cancel -> resume -> speak` 的无条件前置取消模式。
- 保留明确中断场景下的 cancel：关闭语音、暂停、切换步骤、替换当前高优先级 cue、销毁 session。
- 自检结果继续暴露 `canceled`、`blocked`、`error` 等浏览器事件，但自检自身不再主动制造 `canceled`。
- 更新测试，验证正常播报/自检不会预先调用 `speechSynthesis.cancel()`，而显式取消仍会清理浏览器 speech 队列。

## Capabilities

### New Capabilities

### Modified Capabilities
- `workout-session-voice-broadcast`: 调整浏览器 speech synthesis 调用策略，避免每次 speak 前无条件 cancel 导致 utterance 被取消。

## Impact

- 影响 `features/workouts/voice/workout-voice-session.ts`。
- 影响 `features/workouts/voice/workout-voice-self-check.ts`。
- 影响语音相关单元测试。
- 不改变训练计划 API、数据结构、训练步骤推进或语音配置文件格式。
