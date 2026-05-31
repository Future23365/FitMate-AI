## Why

最新 `docs/manual-llm-blackbox-flow-latest-report.md` 只剩 `F05` 第 3 轮失败：用户先提出“每周训练计划”，再补充“每周4练，每次45分钟”，最后说“增肌，有健身房器械”。系统应在长期计划上下文中生成 `workout_plan`，但实际触发了 `exercise_recommendation`。

根因不是动作候选或卡片生成失败，而是黑盒执行器和聊天页复用的 `buildFitnessConversationContext()` 没有把“每周4练”识别为周频事实，只识别“每周4次”。第 3 轮进入服务端时缺少 plan cadence 上下文，目标和器械补齐消息被纯目标推荐归一化抢先处理。

## What Changes

- 扩展会话事实抽取，让 `每周4练`、`一周4练` 与 `每周4次` 一样写入 `knownFacts.weeklyFrequency`。
- 补充回归测试，使用真实黑盒 runner 更接近的上下文构造方式验证 F05 三轮中第 2 轮后的 `conversationContext` 能保留周频和时长，第 3 轮补齐目标和器械时归一化为 `workout_plan`。
- 保持执行边界不变：仍然只有目标、时长/周频、器械等核心事实足够时才触发长期计划；笼统每周计划和只补周频/时长的中间轮仍不得推卡片。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `chat-blackbox-flow-regression-fixes`: 长期计划逐步补齐流程必须把“每周 N 练”识别为周频上下文，并在目标与器械补齐后触发 `workout_plan`。

## Impact

- 影响 `lib/shared/chat/fitness-conversation-context.ts` 的周频事实抽取。
- 影响 `tests/chat-service.test.ts` 的长期计划补齐回归覆盖。
- 不改变数据库结构、HTTP API 契约、AI 输出 schema、前端展示结构或训练计划生成草稿 schema。
