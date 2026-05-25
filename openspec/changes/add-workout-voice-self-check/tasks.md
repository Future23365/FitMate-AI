## 1. Voice self-check implementation

- [x] 1.1 新增独立的 `runWorkoutVoiceSelfCheck()` helper，直接检测 Web Speech API，不依赖训练语音调度器。
- [x] 1.2 自检结果包含 supported、status、reason、voices、selected voice、events、timing 等诊断字段。
- [x] 1.3 自检过程输出 `[WorkoutVoiceCheck]` 开发日志，便于复制浏览器真实结果。

## 2. Training page UI

- [x] 2.1 在 `/training` 训练控制区域新增“语音自检”入口。
- [x] 2.2 展示自检运行中、成功、失败、不支持状态，以及关键诊断字段。
- [x] 2.3 确保自检不改变训练开始/暂停/跳步状态，不写入语音偏好，不触发正式训练播报。

## 3. Verification

- [x] 3.1 添加自检 helper 的单元测试，覆盖 unsupported、成功、blocked、utterance error。
- [x] 3.2 运行 `openspec validate add-workout-voice-self-check --strict`。
- [x] 3.3 运行 `npm test`、`npm run typecheck`、`npm run lint`。
- [x] 3.4 使用 Chrome DevTools MCP 验证 `/training?planId=...` 自检按钮和 console 诊断日志。
