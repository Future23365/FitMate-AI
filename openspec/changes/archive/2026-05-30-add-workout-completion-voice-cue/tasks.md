## 1. 语音配置与 cue 构造

- [x] 1.1 在语音配置类型中新增 `session-complete` cue 类型、默认调度策略和完成文案模板。
- [x] 1.2 在语音 cue 构造工具中新增训练完成提示构造函数，保持页面不直接硬编码语音文本。

## 2. 语音 session 与页面接入

- [x] 2.1 在 `WorkoutVoiceSession` 中新增训练完成播报方法，完成时先清理旧队列并按配置调度完成 cue。
- [x] 2.2 通过 `useWorkoutVoiceBroadcast` 暴露完成播报接口，并在训练完成流程中调用。

## 3. 测试与验证

- [x] 3.1 补充语音配置和语音 session 单元测试，覆盖完成文案和旧语音被完成提示打断。
- [x] 3.2 运行 `openspec validate add-workout-completion-voice-cue --strict`。
- [x] 3.3 运行 `npm test` 和 `npm run typecheck`。
