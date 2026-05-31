## 1. Resolved intent 契约

- [ ] 1.1 定义 `ResolvedChatIntent` 或等价类型，覆盖 `type`、`action`、`responseMode`、`workoutIntent`、`missingActionFields`、`clarificationReplies`、`adjustmentReplies` 和关键字段来源。
- [ ] 1.2 更新聊天意图 Zod schema，兼容旧字段并确保旧 `type`、`workoutIntent`、`canTriggerAction` 从 resolved intent 派生。
- [ ] 1.3 更新 AI trace 记录，展示原始模型输出、最终 resolved intent、字段来源、门控结果和 repair 结果。

## 2. LLM 提示词与 repair

- [ ] 2.1 更新 `chat_intent_resolution` prompt，要求模型一次输出完整 resolved intent，并明确 `ask_clarification`、`generate_directly`、`generate_with_suggestions` 的互斥关系。
- [ ] 2.2 明确 `clarificationReplies` 与 `adjustmentReplies` 的区别：前者只用于缺信息阻断，后者只用于生成后的可选调整建议。
- [ ] 2.3 新增 resolved intent repair prompt，输入原始 resolved intent、门控 violations、referenceResolution 和当前用户消息，只允许修复 resolved intent。

## 3. 服务端一致性门控

- [ ] 3.1 在 `lib/server/chat/chat-service.ts` 增加 `ResolvedIntentGate`，校验回复模式与触发状态、缺失字段、type/action/workoutIntent、引用对象依赖等结构冲突。
- [ ] 3.2 在门控失败时调用一次 LLM repair，并将 repair 后结果重新进入同一套门控。
- [ ] 3.3 在 repair 后仍失败时降级为 `action.shouldTrigger = false`、`responseMode = ask_clarification`，并禁止本轮触发卡片生成。

## 4. 卡片生成链路收敛

- [ ] 4.1 调整服务端内部动作事件，只从最终 resolved intent 构造 `assistant_action`。
- [ ] 4.2 调整 `features/chat/hooks/use-chat-controller.ts`，让前端只根据信息化 action 触发推荐、routine、plan 或 patch 生成。
- [ ] 4.3 移除或停用从自然语言回复正文提取 trigger 的旧路径，避免回复文本成为第二个触发来源。
- [ ] 4.4 调整 `/api/ai/workout-plan` 请求契约，确保关键训练意图来自 resolved intent，不在计划接口中重新决策是否生成 plan。

## 5. 计划生成与结果校验

- [ ] 5.1 调整 `buildPlanStrategyFromChatIntent()` 或其调用方，使 `PlanStrategy` 从 resolved intent、referenceResolution 和字段来源派生。
- [ ] 5.2 控制 `DomainPlanEngine` 默认周期、周频率和时长来源，避免默认值静默覆盖 resolved intent 的明确约束。
- [ ] 5.3 在 plan draft 返回前校验 `cycleLengthDays`、`calendarHorizonDays`、`weeklyFrequency`、`sourceArtifactId` 与 `PlanStrategy` 一致。
- [ ] 5.4 计划结果与 resolved intent 冲突时进入现有自动修复或可继续对话恢复流程，不展示未通过契约校验的计划卡片。

## 6. 用户回复生成

- [ ] 6.1 调整回复生成流程，使生成型请求在 artifact 校验成功或失败后再生成最终用户回复。
- [ ] 6.2 确保 `responseMode = ask_clarification` 时只追问缺失信息或引用对象，不触发同轮卡片。
- [ ] 6.3 确保生成成功时回复说明已按 resolved intent 处理，并把更稳妥方案放入用户可选择的调整建议，而不是私自改写用户需求。

## 7. 自动化测试与验证

- [ ] 7.1 在 `tests/chat-service.test.ts` 覆盖追问模式不得触发 action、生成模式不得携带缺信息澄清、type/action/workoutIntent 冲突进入 repair 或降级。
- [ ] 7.2 在聊天或前端 hook 测试中覆盖前端不得从回复正文二次提取 plan/routine trigger。
- [ ] 7.3 在计划生成测试中覆盖 resolved intent 为 3 天、5 天、一周、每周 3 练等场景，确保周期和周频率不混淆。
- [ ] 7.4 在 DomainPlanEngine 或 validation 测试中覆盖 `PlanStrategy.horizonDays` 与 draft `cycleLengthDays` 冲突时拒绝成功返回。
- [ ] 7.5 运行 `npm run test -- tests/chat-service.test.ts`。
- [ ] 7.6 按实际改动范围运行相关计划生成、reference resolver 或前端 hook 测试。
- [ ] 7.7 运行 `npm run typecheck`。
- [ ] 7.8 运行 `openspec validate unify-chat-intent-decision-flow --strict`。
- [ ] 7.9 如用户确认真实模型 token 成本，再运行相关 `npm run test:llm` 黑盒用例并刷新报告；否则在实现总结中说明未运行原因。
