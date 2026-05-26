# `/training` 整体流程分析计划

## 目标

在修复动作开始卡住问题前，先把 `/training` 的端到端训练执行流程文档化，明确每个状态的拥有者、每个异步回调的边界，以及训练计时和语音播报之间的依赖关系。

这份计划已用于创建 `flow-analysis.md`。当前文件保留为分析方法记录，不作为最新状态流的权威说明；最新结论以 `flow-analysis.md` 为准。

## 分析范围

- 入口路由：`/training?scheduleId=<id>`
- 页面组件：`features/workouts/components/workout-session-page.tsx`
- 语音 hook：`features/workouts/hooks/use-workout-voice-broadcast.ts`
- 语音调度：`features/workouts/voice/workout-voice-session.ts`
- 语音配置：`lib/shared/workouts/voice-broadcast-config.ts`
- 训练时间线：`lib/shared/workouts/composition.ts`
- 训练列表视图：`lib/shared/workouts/session-flow.ts`
- 训练数据客户端：`features/workouts/api/workout-data-client.ts`

## 产出文档结构

后续 `flow-analysis.md` 应包含以下章节：

1. 当前链路概览
   - 从 URL `scheduleId` 到 `getWorkoutSchedule()` 的加载路径
   - 从 `WorkoutSchedule.items` 到 `buildWorkoutTimeline()` 的步骤生成路径
   - 从 `activeStepIndex` 到当前动作、休息、示范图、训练项目列表的派生关系

2. 状态清单
   - 页面层状态：加载状态、开始状态、暂停状态、完成状态、当前步骤、剩余时间、总训练时间、准备阶段
   - 语音 hook 状态：本地偏好、浏览器支持、语音 session 状态、当前 cue 输入
   - 语音 session 状态：active cue、queue、last cue key、是否已激活、Web Speech job
   - 服务端状态：schedule 状态、session result 保存状态

3. 状态拥有者边界
   - 页面层拥有训练是否开始、是否暂停、当前步骤、动作是否可计时
   - 语音 hook 只拥有偏好读取和把页面状态转为语音 cue 的适配逻辑
   - 语音 session 只拥有 Web Speech 播放、cue 队列、取消、失败和诊断
   - 服务端只拥有持久化事实，不反向驱动当前页面会话是否完成

4. 状态迁移图
   - 待开始 -> 动作提示 -> 准备倒计时 -> 动作运行
   - 动作运行 -> 休息运行 -> 下一个动作提示
   - 任意运行态 -> 暂停 -> 原状态继续
   - 任意当前步骤 -> 手动跳步 -> 新步骤状态初始化
   - 最后一步完成 -> 本地完成态 -> 保存结果

5. 异步回调边界
   - Web Speech `onstart`
   - Web Speech `onend`
   - Web Speech `onerror`
   - 语音 fallback timeout
   - 准备倒计时 timeout
   - 动作/休息 interval
   - 计次派生和语音计次 cue
   - 跳步取消和 stale callback
   - 完成提交 promise

6. 卡住问题复盘
   - 为什么“听到开始”不等于页面已经进入动作运行态
   - 为什么暂停/继续能短暂推进，随后又停止
   - 哪些状态 gate 会停止动作计时
   - 哪些语音状态不应再参与动作计时放行

7. 验证矩阵
   - 语音开启：正常动作提示、准备倒计时、动作计时
   - 语音关闭：静默准备后动作计时
   - 语音失败：失败状态可诊断，但训练继续
   - 暂停/继续：准备阶段暂停、动作阶段暂停、休息阶段暂停
   - 跳步：旧步骤语音回调、旧倒计时回调、旧计时回调均被忽略
   - 完成：本地完成态不依赖服务端保存成功

## 分析顺序

1. 先读当前代码，不改代码。
2. 画出当前真实状态流，标记已知卡点。
3. 对照 specs 中新增要求，标记当前实现缺口。
4. 形成目标状态流，明确每个状态迁移由哪个事件触发。
5. 根据目标状态流拆分代码实现任务和测试任务。

## 验证边界

- 默认使用代码阅读、单元测试、类型检查和 lint 验证。
- 不主动启动 dev server。
- 不主动打开浏览器。
- 如确需验证 Web Speech 的真实浏览器行为，必须先说明原因并等待用户明确允许，并且只能复用用户已启动的 `http://localhost:3000`。
