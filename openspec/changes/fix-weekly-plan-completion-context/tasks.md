## 1. 会话事实抽取

- [x] 1.1 扩展 `buildFitnessConversationContext()` 的周频识别，支持 `每周N练` / `一周N练`。
- [x] 1.2 确认笼统每周计划和只补周频时长的中间轮仍不触发训练卡片。

## 2. 自动化测试

- [x] 2.1 在 `tests/chat-service.test.ts` 覆盖黑盒 F05 的真实上下文：第 2 轮后能抽取 `weeklyFrequency=4` 和 `sessionMinutes=45`。
- [x] 2.2 验证第 3 轮 `增肌，有健身房器械` 在该上下文中归一化为 `workout_plan`，并触发 `workout_plan` action。

## 3. 文档与验证

- [x] 3.1 在 `docs/方案变更历史` 记录本次长期计划补齐修复。
- [x] 3.2 在 `docs/项目演变历程.md` 追加本次核心链路修复摘要。
- [x] 3.3 运行 `npm run test -- tests/chat-service.test.ts`。
- [x] 3.4 运行 `npm run typecheck`。
- [x] 3.5 运行 `openspec validate fix-weekly-plan-completion-context --strict`。
- [ ] 3.6 真实 `npm run test:llm` 需要用户确认 token 成本后再运行；若未运行，在总结中说明。
