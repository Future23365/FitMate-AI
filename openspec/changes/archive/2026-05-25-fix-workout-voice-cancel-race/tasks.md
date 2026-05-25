## 1. Speech startup behavior

- [x] 1.1 移除 `runWorkoutVoiceSelfCheck()` 中 `speak()` 前的无条件 `speechSynthesis.cancel()`。
- [x] 1.2 移除 `createWorkoutVoiceSpeechJob()` 中 `speak()` 前的无条件 `speechSynthesis.cancel()`。
- [x] 1.3 调整显式取消逻辑，确保只有存在当前 job 或明确中断场景时才清理浏览器 speech 队列。

## 2. Tests

- [x] 2.1 更新自检测试，验证正常自检不会调用 cancel。
- [x] 2.2 更新正式 speech job 测试，验证正常播报不会调用 cancel。
- [x] 2.3 增加或保留显式 cancel 测试，验证用户/步骤中断仍会清理浏览器 speech 队列。

## 3. Verification

- [x] 3.1 运行 `openspec validate fix-workout-voice-cancel-race --strict`。
- [x] 3.2 运行 `npm test`、`npm run typecheck`、`npm run lint`。
- [x] 3.3 使用 Chrome DevTools MCP 点击训练页语音自检，确认自检路径不再触发 `canceled`。
