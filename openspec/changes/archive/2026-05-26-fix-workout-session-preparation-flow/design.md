## Context

`/training` 的训练执行链路目前横跨三个主要层次：

- 页面层：`features/workouts/components/workout-session-page.tsx` 负责加载 `scheduleId`、构建 timeline、维护开始/暂停/步骤/完成状态，并驱动视觉倒计时。
- 语音 hook：`features/workouts/hooks/use-workout-voice-broadcast.ts` 把页面状态传给语音 session，并根据准备倒计时、计次和剩余时间触发语音或 beep。
- 语音 session：`features/workouts/voice/workout-voice-session.ts` 管理 Web Speech cue、队列、去重、取消、失败和降级。

当前问题暴露出一个边界不清的问题：训练执行状态和语音调度状态都在表达“是否准备中”，并且动作计时放行仍可能受语音 cue 完成回调影响。用户听到“开始”但动作不稳定计时，暂停/继续后只短暂推进，说明页面计时 effect 可以运行，但会被准备态 gate 再次阻塞。

本 change 的实现前提是先把 `/training` 端到端流程分析清楚，再收敛状态模型。语音播报应跟随训练流程，不能成为训练流程的事实源。

## Goals / Non-Goals

**Goals:**

- 建立 `/training` 的单一训练执行状态机，覆盖待开始、动作准备、准备倒计时、动作运行、休息、暂停、完成、跳步和错误/降级路径。
- 让动作步骤进入 running 具有页面侧确定性推进路径，即使语音 `onDone` 丢失、语音被暂停取消、Web Speech 失败或浏览器不支持，也不能无限卡在准备态。
- 让语音 hook 和语音 session 接收明确的训练状态输入，只负责播报和本地音频反馈，不再自行推导或拥有训练准备事实。
- 在实现前补一份整体流程分析计划，明确数据流、状态流、异步回调、取消策略和验证矩阵。

**Non-Goals:**

- 不调整 Prisma schema、数据库迁移或服务端持久化模型。
- 不改变 `WorkoutSchedule`、`WorkoutRoutine`、`WorkoutSessionResult` 的 API 契约。
- 不新增 AI 编排、模型输出结构或健身计划生成规则。
- 不重做训练执行页视觉布局。
- 不要求本 change 立即修改代码；本次只补 OpenSpec 文档和后续实施计划。

## Decisions

### Decision 1: 页面训练状态机作为唯一事实源

后续实现应在页面层维护一个明确的训练执行状态模型，例如：

- `idle`：训练未开始或已重置
- `preparing_intro`：动作提示阶段
- `preparing_countdown`：视觉/语音准备倒计时阶段
- `running_exercise`：动作计时或计次阶段
- `running_rest`：休息倒计时阶段
- `paused`：用户或动作详情导致的暂停
- `completed`：本地训练完成态

语音层只能读取这些状态并播报，不能通过内部 `isPreparing` 或 `preparationCountdown > 0` 重建训练状态。

替代方案是继续用多个布尔值和 key 组合控制流程。这会继续产生“UI 显示开始、动作计时 gate 仍未放行”的中间态，因此不采用。

### Decision 2: 语音完成回调只能推进语音相关阶段，不能成为唯一放行条件

动作准备提示可以在完成时通知页面进入倒计时，但页面必须有兜底推进机制：

- 语音关闭时，直接进入静默准备倒计时。
- 语音失败或不支持时，按配置等待后进入准备倒计时。
- 语音 cue 被暂停、跳步或取消时，只影响语音任务，不得让当前动作永久等待。
- 倒计时归零由页面状态机确定性进入 `running_exercise`。

替代方案是完全依赖 Web Speech `onend`。该事件在不同浏览器、取消、失败、刷新和后台场景下不够稳定，不能作为训练计时唯一放行条件。

### Decision 3: 暂停/继续只影响时间推进，不重置动作准备归属

暂停应冻结当前计时和语音 cue；继续应恢复当前状态对应的下一步动作。暂停/继续不得重新创建当前动作的准备 key，也不得把已经 running 的动作退回 preparing。

替代方案是暂停时取消所有语音并让语音 hook 重新推导状态。这个方案会造成用户看到的“继续后一两秒又停止”，因为语音内部去重和页面准备态可能重新交叉。

### Decision 4: 先写整体流程分析文档，再实现修复

实现前应补充一份流程分析文档，建议路径为：

`openspec/changes/fix-workout-session-preparation-flow/flow-analysis.md`

文档应覆盖：

- schedule 加载和 timeline 构建
- `activeStepIndex`、`remainingSeconds`、总训练时长、准备倒计时之间的关系
- 开始、暂停、继续、跳步、打开动作详情、完成训练的状态迁移
- 语音开启、语音关闭、语音失败、语音取消、无 Web Speech 支持的状态迁移
- 旧步骤异步回调如何被忽略
- 每个状态下哪些 effect 可以运行，哪些必须停止
- 测试和人工验证矩阵

这样做的成本是多一个文档步骤，但可以避免继续围绕局部 effect 做猜测性补丁。

## Risks / Trade-offs

- 状态机收敛会触碰页面、hook、voice session 多个模块 → 通过流程分析文档先确认边界，再分步骤实现并运行相关测试。
- Web Speech 行为在浏览器中不稳定 → 训练计时不依赖 Web Speech 成功；语音失败只影响播报状态。
- 现有语音 scheduler 有队列、去重和取消状态 → 实现时需要明确哪些状态属于语音层，哪些状态必须由页面层拥有。
- 暂停来源不同：手动暂停和动作详情暂停目前对总训练时长有不同语义 → 流程分析需要先列清楚，再决定是否调整命名或状态结构。
- 只用单元测试可能无法覆盖真实浏览器语音事件 → 自动化测试覆盖状态机和 scheduler 契约，真实浏览器验证需在用户明确允许时进行。
