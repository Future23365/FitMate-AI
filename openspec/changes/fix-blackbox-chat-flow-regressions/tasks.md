## 1. 服务端意图归一化

- [x] 1.1 在 `lib/server/chat/chat-service.ts` 增加推荐细化识别，确保已有动作推荐后“推荐几个不用器械的”保持 `exercise_recommendation`。
- [x] 1.2 增加空泛长期计划请求门控，确保“给我一个每周训练计划”不会直接触发 `workout_plan`。
- [x] 1.3 让上一轮器械、场地等 durable facts 能被后续完整 routine 请求继承，同时保持 standalone condition 不推送卡片。

## 2. 自动化回归

- [x] 2.1 在 `tests/chat-service.test.ts` 覆盖 F01 第 3 轮：已有胸部推荐后补充无器械推荐仍触发 `exercise_recommendation`。
- [x] 2.2 在 `tests/chat-service.test.ts` 覆盖 F05 第 1 轮：笼统每周训练计划不推送训练卡片。
- [x] 2.3 在 `tests/chat-service.test.ts` 覆盖 F07 第 2 轮：上一轮“我有哑铃”后，“今天练胸30分钟”触发哑铃胸部 routine。

## 3. 验证

- [x] 3.1 运行 `npm run test -- tests/chat-service.test.ts`。
- [x] 3.2 运行 `npm run typecheck`。
- [x] 3.3 运行 `openspec validate fix-blackbox-chat-flow-regressions --strict`。
- [ ] 3.4 如具备 `DEEPSEEK_API_KEY` 且用户接受真实模型 token 成本，再运行 `npm run test:llm` 刷新 `docs/manual-llm-blackbox-flow-latest-report.md`；否则说明未运行原因。
