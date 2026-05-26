## Why

`/training` 当前存在动作开始后卡在“准备开始”的问题：语音可以播到“开始”，但动作计时没有稳定进入执行态；用户手动暂停再继续后只会短暂推进一两秒，随后又停止。这个现象说明训练计时仍被语音准备流程间接控制，页面训练状态和语音调度状态没有统一事实源。

本 change 只补充修复方案和分析计划文档，不直接改业务代码。后续实现应先收敛训练执行状态模型，再调整语音播报为状态跟随者，避免继续用语音 cue 完成回调决定训练是否进入 running。

## What Changes

- 明确 `/training` 的训练执行状态由页面训练状态机统一驱动，动作计时、休息计时、暂停继续、跳步和完成态都必须读取同一个状态事实源。
- 调整动作准备流程契约：动作准备提示、准备倒计时和正式动作计时必须有页面侧确定性推进路径，不能依赖 Web Speech `onend` 或语音 scheduler 回调作为唯一放行条件。
- 调整语音播报契约：`useWorkoutVoiceBroadcast` 和 `WorkoutVoiceSession` 只能根据训练状态播报当前 cue，不得自行用 `preparationCountdown > 0` 等派生判断重建“准备中”事实。
- 增加整体流程分析计划：在实现修复前，先文档化 `/training` 从加载 schedule、构建 timeline、开始训练、动作准备、语音播报、计时推进、暂停继续、跳步到完成提交的端到端状态流。
- 不改变 API、数据库、Prisma schema、AI 输出结构或持久化契约。

## Capabilities

### New Capabilities

### Modified Capabilities

- `workout-session-step-flow`: 明确训练执行状态机是 `/training` 计时和步骤推进的唯一事实源，并要求动作步骤在语音失败、语音取消或无回调时仍能确定性进入执行态。
- `workout-session-voice-broadcast`: 明确语音播报只能跟随训练状态，不得通过内部准备态或语音 cue 生命周期决定动作计时是否开始。

## Impact

- 影响文档和后续实现范围：`features/workouts/components/workout-session-page.tsx`、`features/workouts/hooks/use-workout-voice-broadcast.ts`、`features/workouts/voice/workout-voice-session.ts`、`lib/shared/workouts/voice-broadcast-config.ts`。
- 影响验证范围：训练执行页的开始、准备提示、准备倒计时、动作计时、暂停继续、跳步、语音开启/关闭、语音失败/取消、无 Web Speech 支持等路径。
- 本 change 当前只创建 OpenSpec 文档，不直接修改上述代码。
