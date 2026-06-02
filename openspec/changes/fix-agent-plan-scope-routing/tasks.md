## 1. Agent Scope 合同

- [ ] 1.1 更新 `lib/server/ai/prompt-config.ts`，明确每周、多天、周期、长期计划或 `weeklyFrequency > 1` 必须优先进入 `plan` 工具链。
- [ ] 1.2 更新 `lib/server/agent-orchestrator/readonly-tools.ts` 中 `searchExercises` 描述和 capability summary，明确 `candidateUse="plan"` 与 `candidateUse="routine"` 的适用边界。
- [ ] 1.3 确保 `generatePlanDraft` 首次生成计划时的工具描述清楚说明可使用本轮候选集合生成 seed routine，无需已有 source artifact。

## 2. Routine Scope 兜底

- [ ] 2.1 更新 `generateRoutineDraft` 输入执行合同，当结构化 `intent.intentType = "routine"` 且 `weeklyFrequency > 1` 时返回可恢复的 scope 冲突失败。
- [ ] 2.2 在 scope 冲突失败中提供稳定 failure code、可读 message、recommended next tool 或等价 feedback，引导 Agent 改走 `generatePlanDraft`。
- [ ] 2.3 确保 scope 冲突失败不会生成 draft、不会通过 validation、不会保存 `ConversationArtifact(kind = "routine")`。
- [ ] 2.4 确保服务端不读取用户原文关键词、正则或短语模板改写 `intentType`、`candidateUse` 或 artifact kind。

## 3. 回归测试

- [ ] 3.1 补充 `generateRoutineDraft` 工具测试，覆盖 `weeklyFrequency > 1` 时返回可恢复 scope 冲突且不生成 routine。
- [ ] 3.2 补充 Agent orchestrator repair 测试，覆盖 routine scope 冲突反馈进入下一轮决策，并能引导模型改用 plan 工具链。
- [ ] 3.3 补充 plan/routine 分流测试，覆盖“每周 4 练，每次 45 分钟”生成 `kind = "plan"`。
- [ ] 3.4 补充反向测试，覆盖“今天/这次/单次 45 分钟”仍生成 `kind = "routine"`。
- [ ] 3.5 更新手动或自动黑盒 LLM flow fixture / assertion，覆盖首页聊天真实路径中的 `workout_plan` 卡片出现。

## 4. 验证与文档

- [ ] 4.1 运行 `openspec validate fix-agent-plan-scope-routing --strict`。
- [ ] 4.2 运行与 Agent 工具、plan/routine 分流相关的单元测试。
- [ ] 4.3 按需运行首页聊天黑盒 LLM flow 或说明无法运行的原因。
- [ ] 4.4 若实现阶段调整了核心链路，按项目规则更新 `docs/方案变更历史` 和 `docs/项目演变历程.md`。
