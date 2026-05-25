## Context

Web Speech API 的 `SpeechSynthesis.cancel()` 会移除队列中的所有 utterance；如果 utterance 还没有开始，`onerror` 可能收到 `error: "canceled"`。当前实现为了“清空旧队列”，在 `createWorkoutVoiceSpeechJob()` 和 `runWorkoutVoiceSelfCheck()` 的 `speak()` 前立即调用 `cancel()`。这在 MCP Chrome 中没有复现，但用户 Chrome 中自检稳定返回 `canceled`，说明不同 Chrome 环境中 `cancel()` 的异步队列处理会影响紧接着提交的新 utterance。

## Goals

- 正式播报和自检在正常启动时不主动调用 `speechSynthesis.cancel()`。
- 只有业务上确实要中断当前语音时才调用 `cancel()`。
- 保持现有队列、优先级、stale callback 防护和训练推进逻辑。
- 保持语音失败时训练流程继续走视觉/静默 fallback。

## Non-Goals

- 不替换 Web Speech API。
- 不引入服务端 TTS 或音频文件。
- 不改变播报文案、时间间隔或配置结构。

## Design

### speech job 启动

`createWorkoutVoiceSpeechJob()` 启动时只执行：

1. 等待 voice 列表或超时。
2. 创建 utterance。
3. 必要时调用 `speechSynthesis.resume()`。
4. 调用 `speechSynthesis.speak(utterance)`。

不再在这里调用 `speechSynthesis.cancel()`。

### 显式中断

`WorkoutVoiceSession.cancelCurrent()` 仍负责明确中断当前 job。当前 job 的本地回调会先置空，随后调用 `cancelBrowserSpeech()` 清空浏览器队列，避免 stale event 更新状态。

没有 active cue 时，不应为了“保险”调用 `cancelBrowserSpeech()`，否则容易取消别的刚提交 speech。改为只有存在 active cue 或明确销毁/关闭路径才清理。

### 自检

`runWorkoutVoiceSelfCheck()` 不再在 `speak()` 前调用 `cancel()`。它只做最小语音合成检测，并保留浏览器返回的 `onerror.error`，便于判断是否仍有外部 cancel 或浏览器策略问题。

## Risks

- 如果浏览器 speech 队列中有页面外部或历史遗留 utterance，去掉前置 cancel 后可能排队等待。当前训练页自己的正式语音由 `WorkoutVoiceSession` 管理，切换步骤和暂停会显式 cancel；自检是诊断路径，保留排队等待更符合真实浏览器状态。
- 高优先级 cue 替换低优先级 cue 时仍会 cancel 当前 job，不影响原有打断语义。

## Validation

- 单元测试覆盖自检和正式 speech job 正常启动不会调用 cancel。
- 单元测试覆盖显式 job cancel 仍会清理浏览器 speech 队列。
- 运行 `openspec validate fix-workout-voice-cancel-race --strict`。
- 运行 `npm test`、`npm run typecheck`、`npm run lint`。
- 使用 Chrome DevTools MCP 点击自检，确认不再由自检路径触发 `canceled`。
