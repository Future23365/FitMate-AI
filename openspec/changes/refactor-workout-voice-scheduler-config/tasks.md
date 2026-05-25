## 1. 配置与文案规则

- [x] 1.1 新增训练语音播报配置文件，定义 speech、beep、队列策略、fallback、倒计时、计次间隔和默认文案模板。
- [x] 1.2 为配置新增 TypeScript 类型和配置校验，确保非法时间、音量、速率、优先级、队列长度等值能在测试或开发阶段暴露。
- [x] 1.3 重构 `lib/shared/workouts/voice-cues.ts`，让动作介绍、步骤提示、休息提示、倒计时和计次文案通过配置模板生成。
- [x] 1.4 为配置默认值和文案生成补充单元测试，验证开发者修改模板和时间参数后能影响生成结果。

## 2. 语音会话调度器

- [x] 2.1 新增独立语音调度器模块，定义 cue 类型、任务优先级、step key、job id、队列项、播放状态和诊断事件类型。
- [x] 2.2 实现 speech adapter，统一封装 `speechSynthesis`、`SpeechSynthesisUtterance`、中文 voice 选择、事件回调、fallback timeout 和取消。
- [x] 2.3 实现调度策略：高优先级动作介绍和步骤介绍不被计次或倒计时抢断，步骤切换、跳步、关闭和离开页面取消旧任务。
- [x] 2.4 实现低优先级 cue 的去重、过期、队列长度限制和 overflow 策略，默认丢弃旧的低优先级计次提示。
- [x] 2.5 保持 Web Audio beep 独立于 speech 队列，确保 beep 成功不能把 speech 状态标为 active。

## 3. React 与训练页接入

- [x] 3.1 将 `useWorkoutVoiceBroadcast` 改为语音调度器的 React 适配层，移除多个 effect 直接互相 `cancelSpeech()` 的结构。
- [x] 3.2 让 `WorkoutSessionPage` 以训练事件接入语音层，包括 activate、stepChanged、preparationCountdownChanged、repetitionChanged、pause、resume、skip、finish。
- [x] 3.3 保留训练页面对准备状态的所有权，只通过 `preparationIntroCompleted`、`speechFailed`、`voiceActivated`、`voiceNeedsActivation` 等事件推进 UI。
- [x] 3.4 修复开启语音后的首个动作介绍被计次或倒计时取消的问题，确保准备介绍完成后才进入配置化倒计时。
- [x] 3.5 确保刷新后偏好开启仍进入 `needs-activation`，下一次有效用户手势通过调度器恢复当前步骤播报。

## 4. 测试覆盖

- [x] 4.1 新增语音调度器单元测试，覆盖高低优先级、排队、抢占、过期、取消、stale callback 和 overflow。
- [x] 4.2 新增配置测试，覆盖默认配置合法性、非法配置失败、文案模板替换和时间参数生效。
- [x] 4.3 扩展训练语音测试，覆盖点击开启后动作介绍不被计次抢断、准备倒计时按顺序播报、计时 beep 不影响 speech 状态。
- [x] 4.4 覆盖刷新恢复、语音失败降级、speech unsupported、Web Audio unavailable、暂停/跳步/结束清理任务等路径。

## 5. 验证与收尾

- [x] 5.1 运行 `npm test`，确保语音调度、配置和训练流程测试通过。
- [x] 5.2 运行 `npm run typecheck`，确保配置、调度器和 React 接入类型正确。
- [x] 5.3 运行 `npm run lint`，确保重构后的模块无 lint 错误。
- [x] 5.4 使用 Chrome DevTools MCP 访问已有 `http://localhost:3000/training`，验证开启语音、动作介绍、倒计时、计次、beep、暂停、跳步、刷新恢复和错误日志。
- [x] 5.5 删除旧的抢占式语音实现和误导性测试，确保不存在双调度路径。
