## 1. 候选与训练生成决策

- [x] 1.1 移除 `injuryLimitations`、`healthSignalLabels`、`injury_or_pain_signal` 对动作候选排除、候选不足和 warning 的影响。
- [x] 1.2 移除用户只表达身体不适时固定降级为 `general_fitness_advice` 的归一化分支。
- [x] 1.3 保留非医疗边界：动作存在性、候选集合、section、器械、难度、时长和结构化校验继续生效。

## 2. 记忆、确认与 Patch

- [x] 2.1 停止从聊天文本或用户画像生成会影响训练决策的 `injury_or_pain_signal` 记忆。
- [x] 2.2 移除健康/不适信号写入长期记忆确认流。
- [x] 2.3 移除 Patch 替换动作的 `replacement_risk_too_high` 拒绝逻辑。

## 3. Prompt 与文档

- [x] 3.1 更新 Prompt，删除“疼痛或限制作为当前动作选择边界”的提示，只保留不做医疗诊断/治疗承诺。
- [x] 3.2 更新架构、数据库设计和方案变更历史，说明健康/医疗信号不再参与训练生成决策。

## 4. 测试与验证

- [x] 4.1 更新候选筛选、Patch、用户记忆、Policy 和聊天服务测试，断言健康/医疗信号不阻断结果。
- [x] 4.2 运行 `openspec validate remove-medical-health-risk-boundaries --strict`。
- [x] 4.3 运行相关自动化测试，至少覆盖 `tests/workout-plan.test.ts`、`tests/user-feedback-memory-service.test.ts`、`tests/policy-confirmation-service.test.ts`、`tests/chat-service.test.ts`。
- [x] 4.4 按需运行 `npm run typecheck` 或说明无法运行的原因。
