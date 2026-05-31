## Context

`docs/manual-llm-blackbox-flow-latest-report.md` 的失败结果说明，核心链路从历史消息窗口迁移到 `conversationSummary + latestUserMessage` 后，真实模型在几个高频语义上仍会漂移：

- 目标明确但语气像“今天练胸”的纯推荐，被模型当成需要补器械和时长的 routine。
- 已生成 routine 后，“改成45分钟”等短指令没有稳定继承最近目标和场地，走到了引用澄清或空推送。
- “我有哑铃”这类单个条件输入被模型补了默认目标和时长，越权触发 routine。
- “6 天训练计划”被识别为长期计划，但又因为缺少器械而追问，和黑盒期望的长期计划主路径不一致。

当前系统仍应保持模型只看 `conversationSummary` 和当前最新消息的边界；修复不能回退到完整历史消息窗口，也不能让前端成为事实来源。

## Goals / Non-Goals

**Goals:**

- 在服务端增加意图后处理归一化，把黑盒失败中稳定可判定的中文短语收敛成确定性边界。
- 让上下文继承优先使用已校验的 `conversationSummary`、`conversationContext.currentIntent` 和最近 artifact 摘要，而不是让模型自由补默认值。
- 保持 `exercise_recommendation`、`workout_routine`、`workout_plan` 三类触发语义清晰，避免追问按钮和训练卡片同时出现。
- 增加自动化测试覆盖报告中的失败样例，手动 LLM 黑盒测试继续作为真实模型验收。

**Non-Goals:**

- 不改变 `/api/chat` 的外部请求或 stream 事件契约。
- 不引入新的数据库字段、Prisma migration 或长期记忆表结构调整。
- 不把完整历史消息重新暴露给 LLM。
- 不在本 change 中重新设计黑盒测试执行器。

## Decisions

1. **采用服务端意图归一化层，而不是只改 prompt。**

   prompt 会同步收紧规则，但真实模型仍可能在“今天想练胸”“我有哑铃”这类短句上漂移。服务端在 `resolveChatIntent` 之后基于当前消息、summary 和内部上下文做一次归一化，可以把高频确定性边界变成可测试逻辑。

2. **把孤立条件输入识别为事实记录，不触发训练卡片。**

   如果当前消息只表达器械、场地、经验或限制，没有训练目标、推荐/安排动词或计划语义，即使模型填了默认 `goal/sessionMinutes`，服务端也应覆盖为 `general_fitness_advice` 或不可触发状态，并把建议回复保留给后续补齐。

3. **短指令继承最近 action intent。**

   对“改成45分钟”“做成20分钟”“降低一点”“不用器械”等依赖历史的请求，服务端应从 `conversationContext.currentIntent` 或最近 artifact 摘要继承目标和意图类型，再用当前消息覆盖时长、器械、偏好或强度。这样不需要完整历史，也能满足用户对最近卡片的自然引用。

4. **长期计划语义宽于 routine。**

   用户明确说“6 天训练计划/每周 6 练/未来 6 天每天练”时，系统应先触发 `workout_plan`，缺少器械时可以使用保守默认或泛化候选生成，而不是强制追问导致主路径失败。后续用户仍可继续补充器械、目标和频率覆盖。

## Risks / Trade-offs

- 规则过宽导致误触发训练卡片 → 通过“孤立条件输入不触发”和候选不足阻断控制边界。
- 服务端规则和 prompt 重复 → prompt 表达产品语义，服务端只处理黑盒已暴露的稳定短语和安全兜底。
- conversationSummary 质量仍会影响多轮效果 → 用 `conversationContext.currentIntent` 和 recent artifact 摘要作为服务端内部事实补强，但不暴露完整历史给模型。
- 真实 LLM 黑盒测试成本较高 → 默认验证先跑单元测试和类型检查；真实 `npm run test:llm` 作为需要成本确认的最终验收入口。
