## 1. 数据模型与类型

- [x] 1.1 新增 `UserMemory`、`UserExerciseFeedback` 或等价持久化结构，包含 kind、subject、value、confidence、source、expiresAt、requiresConfirmation 和 status。
- [x] 1.2 增加用户记忆、动作反馈、临时上下文和健康/不适信号的 TypeScript 类型与 Zod 校验。
- [x] 1.3 定义训练完成结果如何提供完成率、跳过动作、实际时长和主观疲劳输入。

## 2. 写入规则

- [x] 2.1 实现“不喜欢某动作”写入长期 exercise dislike。
- [x] 2.2 实现“某动作太难”写入 too_hard，并优先影响后续降阶候选。
- [x] 2.3 实现“今天不想练腿”等临时上下文写入，必须设置短期有效范围。
- [x] 2.4 实现健康/不适信号写入保守约束，并按 Policy 标记是否需要确认。
- [x] 2.5 对“以后都不要”等长期强约束接入 Confirmation Gate。

## 3. 读取与接入

- [x] 3.1 在 Conversation State Builder 中按优先级读取当前消息、当前 artifact、用户画像、近期反馈、训练结果和默认值。
- [x] 3.2 将动作反馈接入 Exercise Retrieval Service 的过滤和排序。
- [x] 3.3 将用户记忆接入 DomainPlanEngine、PatchValidator 和推荐解释文案。
- [x] 3.4 确保 userId 权限隔离，禁止读取其他用户记忆。

## 4. 测试与验证

- [x] 4.1 补充记忆写入测试，覆盖 dislike、too_hard、temporary_context 和 injury_or_pain_signal。
- [x] 4.2 补充临时上下文过期和不污染长期画像测试。
- [x] 4.3 补充读取优先级测试，确认当前消息覆盖历史记忆。
- [x] 4.4 补充确认写入测试，覆盖长期限制和健康/不适信号。
- [x] 4.5 运行 `npm test`、`npm run typecheck` 和 `npm run lint`。

## 5. 文档记录

- [x] 5.1 在 `docs/方案变更历史` 新增方案变更记录，说明用户反馈从聊天摘要升级为结构化记忆。
- [x] 5.2 如新增表、记忆字段或健康信号处理规则，同步更新相关架构文档。
