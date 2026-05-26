## 1. 整体流程分析

- [ ] 1.1 阅读当前 `/training` 训练执行链路，覆盖 `workout-session-page.tsx`、`use-workout-voice-broadcast.ts`、`workout-voice-session.ts`、`voice-broadcast-config.ts` 和 `composition.ts`
- [ ] 1.2 补充 `flow-analysis.md`，画清 schedule 加载、timeline 构建、开始训练、动作准备、准备倒计时、动作运行、休息、暂停继续、跳步、动作详情暂停、完成提交的状态流
- [ ] 1.3 在 `flow-analysis.md` 中列出页面层、语音 hook、语音 session、服务端各自拥有的状态和不得拥有的状态
- [ ] 1.4 在 `flow-analysis.md` 中列出所有异步来源：Web Speech `onstart/onend/onerror`、fallback timer、准备倒计时 timer、动作 timer、计次计算、跳步取消、完成提交回调
- [ ] 1.5 在 `flow-analysis.md` 中列出验证矩阵，区分自动化测试、代码阅读验证和需要用户明确允许后才能做的真实浏览器语音验证

## 2. 状态模型设计落地

- [ ] 2.1 设计训练执行状态类型，明确待开始、动作提示、准备倒计时、动作运行、休息运行、暂停、完成和加载错误状态
- [ ] 2.2 明确每个训练控制操作的状态迁移：开始、暂停、继续、上一个、下一个、跳过休息、打开动作详情、关闭动作详情、完成训练
- [ ] 2.3 明确旧步骤回调的忽略规则，所有准备、语音、计时、计次回调都必须校验当前步骤 key 或状态版本
- [ ] 2.4 明确总训练时长和当前步骤时长的暂停规则，保留现有“手动暂停才暂停总时长”的业务语义或在文档中标记需要确认

## 3. 页面训练流程修复

- [ ] 3.1 重构 `workout-session-page.tsx` 的准备态、动作运行态和休息运行态，使动作计时只读取页面训练执行状态
- [ ] 3.2 为语音关闭、语音不支持、语音失败、语音回调缺失增加页面侧确定性兜底推进路径
- [ ] 3.3 修复暂停/继续逻辑，确保暂停只冻结当前状态，继续不会把已运行中的动作退回准备态
- [ ] 3.4 修复跳步逻辑，确保新步骤初始化新的状态归属，并忽略旧步骤后续异步回调

## 4. 语音播报边界修复

- [ ] 4.1 调整 `useWorkoutVoiceBroadcast` 入参，使用页面提供的明确训练状态，不再用 `preparationCountdown > 0` 推导动作准备事实
- [ ] 4.2 调整 `WorkoutVoiceSession` 的准备 cue、倒计时 cue、计次 cue 和 beep cue，使其只播报状态，不拥有动作计时放行状态
- [ ] 4.3 确认语音 cue 取消、失败、stale event 和 fallback 回调不会覆盖当前页面训练状态
- [ ] 4.4 保持语音设置、自检和开发日志只用于诊断，不改变当前训练步骤或准备阶段

## 5. 测试与验证

- [ ] 5.1 补充或更新训练执行状态机相关测试，覆盖准备提示完成、准备倒计时归零、语音回调缺失、语音失败、暂停继续和跳步场景
- [ ] 5.2 补充或更新语音 hook/session 测试，覆盖语音只跟随训练状态、不自行决定动作计时放行的契约
- [ ] 5.3 运行 `npm test`
- [ ] 5.4 运行 `npm run typecheck`
- [ ] 5.5 运行 `npm run lint`
- [ ] 5.6 如实现影响构建、路由或客户端/服务端边界，运行 `npm run build`；否则在完成说明中说明未运行原因
- [ ] 5.7 如需要真实浏览器验证 Web Speech 行为，先说明原因并等待用户明确允许，复用已启动的 `http://localhost:3000`

## 6. 收尾

- [ ] 6.1 汇总根因、修复位置、状态模型变化和验证结果
- [ ] 6.2 更新相关 README/TODO 或 OpenSpec 文档中已过期的训练计时问题记录
- [ ] 6.3 运行 `openspec validate fix-workout-session-preparation-flow --strict`
- [ ] 6.4 确认 change 可进入 apply 或 archive 后续流程
