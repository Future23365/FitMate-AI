## 1. 回归定位

- [x] 1.1 对照 `docs/manual-llm-blackbox-flow-latest-report.md` 梳理失败样例对应的意图边界。
- [x] 1.2 确认当前聊天编排、summary 上下文和黑盒执行器的真实数据流。

## 2. 聊天意图修复

- [x] 2.1 增加服务端意图归一化，修复目标明确纯动作推荐被追问的问题。
- [x] 2.2 增加孤立条件输入保护，避免只有器械或场地条件时越权触发训练卡片。
- [x] 2.3 增加短指令上下文继承和当前消息覆盖逻辑，支持时长、器械和难度调整沿用最近训练事实。
- [x] 2.4 收紧 `chatIntentResolution` prompt，减少真实模型在黑盒失败短语上的漂移。

## 3. 测试与验证

- [x] 3.1 增加单元测试覆盖胸部动作推荐、只记录哑铃、修改时长、非健身后切回训练和 6 天训练计划。
- [x] 3.2 运行相关自动化测试，至少覆盖 `tests/chat-service.test.ts` 和 `tests/chat-context.test.ts`。
- [x] 3.3 运行 `npm run typecheck` 或说明无法运行的原因。
- [x] 3.4 重新运行 `openspec validate fix-chat-blackbox-flow-regressions --strict`。
