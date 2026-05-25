## Why

训练执行页的语音播报当前存在开关显示开启但实际无声、刷新页面后无法稳定恢复播报、播放失败被吞掉且无法从状态上判断的问题。语音播报已经影响训练开始、准备倒计时、计时节奏和计次提示，继续在页面组件和 hook 中用零散 effect 拼接会让训练流程不可预测。

## What Changes

- 重构 `/training` 语音播报为明确的客户端音频会话模型，区分“用户偏好开启”、“浏览器能力支持”、“本次页面音频已激活”和“当前播报任务状态”。
- 点击开启语音时，必须在用户手势内启动当前步骤的实际播报尝试，并根据 `SpeechSynthesisUtterance` 的 `onstart` / `onend` / `onerror` 更新状态，不能仅凭调用函数就把 UI 标为可播报。
- 刷新页面后，如果本地偏好为开启，页面应进入等待用户手势激活的状态，并在下一次有效点击、键盘或触控手势中恢复当前训练步骤播报；不能静默显示开启但不发声。
- 训练准备提示、倒计时提示、步骤切换提示、计时 beep 和计次数字提示统一通过同一个语音会话控制器排队、取消和去重。
- 语音不可用或播放失败时，训练计时、准备倒计时、暂停、跳步和结束训练必须继续可用，并提供可观察的页面内状态或开发日志，避免失败被无声吞掉。
- 不引入 AI、麦克风、服务端音频持久化或第三方语音依赖。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workout-session-voice-broadcast`: 修改训练页语音播报的开启、刷新恢复、播放状态确认、失败降级和语音任务控制要求。

## Impact

- 影响 `features/workouts/hooks/use-workout-voice-broadcast.ts` 中 Web Speech API、Web Audio beep、播报队列、取消和错误处理逻辑。
- 影响 `features/workouts/components/workout-session-page.tsx` 中语音开关状态、刷新后偏好加载、准备阶段推进和用户手势激活逻辑。
- 可能新增训练语音相关纯函数或客户端控制器模块，用于隔离浏览器音频会话和训练 timeline 状态。
- 需要补充语音播报控制器的单元测试或可 mock 的浏览器 API 测试，并保留现有文案纯函数测试。
