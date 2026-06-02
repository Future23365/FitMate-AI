## 1. 合同审计确认

- [ ] 1.1 人工审阅 `tool-contract-audit.md`，确认所有 Agent Tool 的输入、执行、返回和禁止行为符合预期。
- [ ] 1.2 根据人工审阅结果调整 `proposal.md`、`design.md`、delta specs 和 `tool-contract-audit.md`。
- [ ] 1.3 明确 `section-aware-routine-candidate-pools` 只保留候选池/evidence 思路，不按“服务端根据 sectionPools 生成 routine”方向实现。

## 2. Generate Routine Tool 重构

- [ ] 2.1 修改 `generateRoutineDraftAgentToolInputSchema`，要求输入包含 LLM-authored `WorkoutRoutineDraft` 或等价 structured sections。
- [ ] 2.2 移除 `generateRoutineDraft` 生产路径中对 `buildRoutineDraftFromCandidates()`、`buildRoutineSectionBuckets()`、`selectRoutineSectionForRequiredExercise()` 和自动补 section 的依赖。
- [ ] 2.3 实现 routine draft 登记逻辑：parse draft、校验 candidate set、校验 requiredExerciseIds 覆盖、登记 `draftId`。
- [ ] 2.4 确保 `generateRoutineDraft` 不修改 LLM 输出的 section、exerciseId、sets、target、rest 或 notes。
- [ ] 2.5 更新 prompt 和 tool summary，要求 LLM 在 `generateRoutineDraft` 输入中提交完整 routine draft。

## 3. Generate Plan Tool 重构

- [ ] 3.1 修改 `generatePlanDraftAgentToolInputSchema`，要求输入包含 LLM-authored `WorkoutPlanDraft` 或等价 structured plan。
- [ ] 3.2 移除 `generatePlanDraft` 生产路径中对 `expandDomainPlan()` 自动生成完整 plan draft 的依赖。
- [ ] 3.3 移除无 source artifact 时通过 `createSeedRoutineSourceArtifact()` 构造 seed routine 的生产路径。
- [ ] 3.4 实现 plan draft 登记逻辑：parse draft、校验 candidate set、校验 source artifact 边界、登记 `draftId`。
- [ ] 3.5 更新 prompt 和 tool summary，要求 LLM 在 `generatePlanDraft` 输入中提交完整 plan draft。

## 4. DomainPlanEngine 收缩

- [ ] 4.1 移除或隔离 `buildPlanStrategyFromWorkoutIntent()` 在生产 Agent 链路中的使用。
- [ ] 4.2 删除生产路径里基于 `latestUserMessage` 的正则推断周期、频率、策略、强度、约束和递进语义。
- [ ] 4.3 将 `DomainPlanEngine` 保留为确定性 schedule / calendar preview 或一致性校验辅助。
- [ ] 4.4 更新 `domain-plan-engine` specs 和测试，确保它不再生成完整训练语义草稿。

## 5. 候选与校验边界

- [ ] 5.1 保持 `searchExercises` 只返回候选集合、适用性候选池和 evidence，不返回最终 routine / plan 编排。
- [ ] 5.2 调整 `validateRoutineDraft` 和 `validatePlanDraft`，确保它们继续只消费已登记 draft resource。
- [ ] 5.3 调整 validation recovery，使失败恢复只要求 LLM repair、重新查候选、澄清或阻断，不自动补写训练语义。
- [ ] 5.4 确保 `evaluatePolicy` 和 `saveConversationArtifactRevision` 只能消费通过 validation 的 LLM-authored draft resource。

## 6. 测试与验证

- [ ] 6.1 更新 `tests/agent-orchestrator.test.ts` 中 `generateRoutineDraft` 用例，输入完整 LLM-authored routine draft。
- [ ] 6.2 更新 `tests/agent-orchestrator.test.ts` 中 `generatePlanDraft` 用例，输入完整 LLM-authored plan draft。
- [ ] 6.3 增加回归测试：只传 `candidateExerciseIds` 调用 `generateRoutineDraft` 必须失败，不得服务端自动编排。
- [ ] 6.4 增加回归测试：只传 `strategy` 调用 `generatePlanDraft` 必须失败，不得服务端自动展开 plan。
- [ ] 6.5 增加回归测试：`DomainPlanEngine` 不得从 `latestUserMessage` 正则推断生产字段。
- [ ] 6.6 更新黑盒 LLM flow 期望，验证 LLM 会输出完整 structured routine / plan draft。
- [ ] 6.7 运行相关定向测试：`tests/agent-orchestrator.test.ts`、`tests/domain-plan-engine.test.ts`、`tests/workout-plan-validation.test.ts`、`tests/readonly-tools.test.ts`。
- [ ] 6.8 运行 `npm run typecheck`。
- [ ] 6.9 运行 `openspec validate realign-agent-tools-with-llm-authored-drafts --strict`。
