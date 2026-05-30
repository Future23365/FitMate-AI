## 1. PlanStrategy 与类型

- [ ] 1.1 新增 `PlanStrategy`、progressionPolicy、intensityBias 和计划引擎输入输出类型。
- [ ] 1.2 为 PlanStrategy 增加 Zod 或 JSON Schema 校验，拒绝缺少 horizonDays、weeklyFrequency、sessionMinutes 或 strategy 的计划策略。
- [ ] 1.3 定义 PlanStrategy 在 `/api/chat` 编排中的生成位置和 trace step。

## 2. DomainPlanEngine

- [ ] 2.1 实现 `repeat_previous_routine`，按用户指定周期和周频率重复引用 routine。
- [ ] 2.2 实现 `repeat_same_routine_with_progression`，按保守规则小幅递进组数、次数或难度。
- [ ] 2.3 实现 `weekly_split` 和 `alternating_ab` 的基础展开规则。
- [ ] 2.4 实现训练日和休息日安排，避免连续高负荷同肌群训练。
- [ ] 2.5 输出 schedule preview 和可解释摘要，不直接批量写入未来 schedule。

## 3. Validator 与聊天接入

- [ ] 3.1 校验训练日数量匹配 weeklyFrequency，周期天数匹配 horizonDays。
- [ ] 3.2 校验每个训练日的 section、动作候选来源、预估时长、连续负荷和风险边界。
- [ ] 3.3 将“三周都练这个”“一周三练”“改成一周四练但别太累”等表达接入 ReferenceResolver + PlanStrategy + DomainPlanEngine 流程。
- [ ] 3.4 对缺少核心条件或候选不足的情况返回继续对话引导。

## 4. 测试与验证

- [ ] 4.1 补充 DomainPlanEngine 单元测试，覆盖重复 routine、递进、AB 交替、周频率和休息日安排。
- [ ] 4.2 补充聊天集成测试，覆盖“三周都练这个”和“改成一周四练但别太累”。
- [ ] 4.3 补充 Validator 测试，覆盖连续负荷、训练日数量和时长偏离。
- [ ] 4.4 运行 `npm test`、`npm run typecheck` 和 `npm run lint`。

## 5. 文档记录

- [ ] 5.1 在 `docs/方案变更历史` 新增方案变更记录，说明长期计划从 LLM 自由生成升级为 PlanStrategy + DomainPlanEngine。
- [ ] 5.2 在 `docs/项目演变历程.md` 末尾追加本次核心计划引擎链路改进记录。
