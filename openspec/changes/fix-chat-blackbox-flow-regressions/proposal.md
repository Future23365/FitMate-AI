## Why

最新 `docs/manual-llm-blackbox-flow-latest-report.md` 显示核心聊天链路调整后，首页聊天黑盒流程出现 6 个失败和 8 个级联跳过。失败集中在目标明确的动作推荐没有推送、已有训练结果后的短指令没有继承上下文、以及单个条件输入被误判为完整训练生成。

这些问题会破坏用户从自然语言到动作推荐、单次训练和长期计划的主路径，因此需要把黑盒反馈固化为服务端意图边界和回归验证。

## What Changes

- 修复目标明确的纯动作推荐触发边界，确保“今天我想练胸”“那我今天练胸”“今天想练胸”这类输入触发 `exercise_recommendation`，而不是追问器械或时长。
- 修复会话内短指令上下文继承，确保“改成45分钟”“太难了，降低一点”“做成20分钟”等输入能沿用最近训练目标、场地、器械和意图类型。
- 修复孤立条件输入的触发边界，确保“我有哑铃”这类只记录条件的消息不会生成训练卡片，但后续完整需求可以继承该条件。
- 修复“6 天训练计划”“每周 6 练”“未来 6 天每天练”的长期计划语义，避免把缺少器械或经验作为阻断长期计划的理由。
- 增加覆盖黑盒失败样例的自动化回归测试，并保留手动 LLM 黑盒报告作为真实模型验收入口。

## Capabilities

### New Capabilities

- `chat-blackbox-flow-regression-fixes`: 覆盖首页聊天黑盒流程暴露的意图触发、上下文继承和条件覆盖回归。

### Modified Capabilities

- `chat-exercise-recommendation-trigger`: 明确目标部位型推荐不得因缺少器械、场地或时长而追问。
- `chat-context-summarization`: 明确短指令必须可沿用 conversationSummary 与服务端内部上下文中的最近训练事实。

## Impact

- 影响 `lib/server/chat/chat-service.ts` 的聊天意图归一化、内部动作触发边界和上下文事实合并。
- 影响 `lib/server/ai/prompt-config.ts` 的意图解析约束，减少真实模型在黑盒流程中的语义漂移。
- 影响 `lib/shared/chat/fitness-conversation-context.ts` 的确定性事实抽取或覆盖规则。
- 影响 `tests/chat-service.test.ts`、`tests/chat-context.test.ts` 或新增相关测试。
- 不改变 `/api/chat` 请求/响应契约，不新增数据库表或迁移。
