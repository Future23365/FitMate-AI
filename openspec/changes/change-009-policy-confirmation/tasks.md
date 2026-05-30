## 1. Policy 与 Confirmation 类型

- [ ] 1.1 新增 `PolicyCheckResult`、safeScope、policy reason 和 confirmation 相关类型。
- [ ] 1.2 新增 `ConfirmationToken` 或等价确认状态，绑定 userId、目标 id、scope、diff 摘要、过期时间和操作类型。
- [ ] 1.3 为 Policy 和 Confirmation 增加 Zod 校验。

## 2. PolicyEngine

- [ ] 2.1 实现 artifact 权限、status、revision 和 userId 检查。
- [ ] 2.2 实现 routine 是否已保存、是否允许覆盖、是否应创建 revision 的策略。
- [ ] 2.3 实现 schedule 是否已完成、是否属于未来安排、是否允许批量修改的策略。
- [ ] 2.4 实现用户记忆写入策略，长期限制和健康/不适信号默认需要确认。
- [ ] 2.5 对未明确范围的请求返回更窄 safeScope，避免默认批量覆盖。

## 3. ConfirmationGate 接入

- [ ] 3.1 对批量修改多个未来训练日、覆盖已保存 routine、改变周频率、重排日历、大幅调整强度和删除多个动作触发确认。
- [ ] 3.2 用户确认前只返回确认问题、候选影响范围和 diff 摘要，不执行持久化写入。
- [ ] 3.3 用户确认后校验 confirmation token，重新执行 Policy 和 Validator 后再写入。
- [ ] 3.4 将 policy_check 和 confirmation_gate 写入 AiRunTrace。

## 4. 测试与验证

- [ ] 4.1 补充未保存草稿单动作替换无需确认测试。
- [ ] 4.2 补充覆盖 saved routine、批量 future schedule、改变周频率和重排日历需要确认测试。
- [ ] 4.3 补充已完成 schedule 和 session result 默认不可修改测试。
- [ ] 4.4 补充 confirmation token 绑定 diff/scope 和过期拒绝测试。
- [ ] 4.5 运行 `npm test`、`npm run typecheck` 和 `npm run lint`。

## 5. 文档记录

- [ ] 5.1 在 `docs/方案变更历史` 新增方案变更记录，说明高影响 AI 写操作由 Policy 和 Confirmation Gate 控制。
- [ ] 5.2 在 `docs/项目演变历程.md` 末尾追加本次核心写操作确认边界记录。
