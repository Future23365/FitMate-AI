## 1. 合同审计确认

- [ ] 1.1 人工审阅 `tool-contract-audit.md`，确认所有 Agent Tool 的输入、执行、返回和禁止行为符合预期。
- [ ] 1.2 根据人工审阅结果调整 `proposal.md`、`design.md`、delta specs 和 `tool-contract-audit.md`。
- [ ] 1.3 明确 `section-aware-routine-candidate-pools` 不按“服务端根据 sectionPools 生成 routine”方向实现；热身 / 拉伸默认无器械改由纯搜索 filters 和 validator 约束表达。

## 2. 搜索类 Tool 重构

- [ ] 2.1 修改 `searchExercises` schema，移除 `operation`、`candidateUse`、`resultRequirements`、`sectionCoverage`、`satisfied` 和生成候选集合状态。
- [ ] 2.2 将 `searchExercises` 输出改为纯搜索结果：`exerciseSearchResultId`、`exercises[]`、`appliedFilters`、`diagnostics`。
- [ ] 2.3 实现热身 / 拉伸默认无器械搜索规则：当 `allowedSections` 只包含 `warmup` 或只包含 `stretch` 且用户未指定器械热身 / 器械拉伸时，确定性补入 no-equipment 过滤。
- [ ] 2.4 修改 `searchArtifacts` schema，移除 `candidateUse` 和搜索结果用途字段，输出 `artifactSearchResultId`。
- [ ] 2.5 更新 prompt 和 tool summary，要求 LLM 为热身、主训练、拉伸按需分别调用 `searchExercises`，不要依赖单个搜索工具判断覆盖是否满足。

## 3. Routine Draft 登记 Tool 重构

- [ ] 3.1 修改 `generateRoutineDraftAgentToolInputSchema`，目标语义收敛为 `registerRoutineDraft`，要求输入包含 LLM-authored `WorkoutRoutineDraft` 或等价 structured sections。
- [ ] 3.2 将输入边界从 `candidateSetId` / `candidateExerciseIds` 改为 `exerciseSourceIds`、`sourceArtifactPayloadId`、`sourceEditPlanId`、`requiredExerciseIds` 和结构化 `requirements`。
- [ ] 3.3 移除 `generateRoutineDraft` 生产路径中对 `buildRoutineDraftFromCandidates()`、`buildRoutineSectionBuckets()`、`selectRoutineSectionForRequiredExercise()` 和自动补 section 的依赖。
- [ ] 3.4 实现 routine draft 登记逻辑：parse draft、从 `exerciseSourceIds` 恢复允许动作、校验 requiredExerciseIds 覆盖、登记 `draftId`。
- [ ] 3.5 确保登记工具不修改 LLM 输出的 section、exerciseId、sets、target、rest 或 notes。

## 4. Plan Draft 登记 Tool 重构

- [ ] 4.1 修改 `generatePlanDraftAgentToolInputSchema`，目标语义收敛为 `registerPlanDraft`，要求输入包含 LLM-authored `WorkoutPlanDraft` 或等价 structured plan。
- [ ] 4.2 将输入边界从 `candidateSetId` / `candidateExerciseIds` 改为 `exerciseSourceIds`、`sourceArtifactPayloadIds`、`sourceEditPlanId`、`strategy` 和结构化 `requirements`。
- [ ] 4.3 移除 `generatePlanDraft` 生产路径中对 `expandDomainPlan()` 自动生成完整 plan draft 的依赖。
- [ ] 4.4 移除无 source artifact 时通过 `createSeedRoutineSourceArtifact()` 构造 seed routine 的生产路径。
- [ ] 4.5 实现 plan draft 登记逻辑：parse draft、从 `exerciseSourceIds` 和 source artifact 恢复允许动作、校验 schedule consistency、登记 `draftId`。

## 5. Patch / Edit Plan 登记 Tool 重构

- [ ] 5.1 将 `proposeWorkoutEditPlan` 目标语义收敛为 `registerWorkoutEditPlan`，明确只登记 LLM-authored edit plan。
- [ ] 5.2 将 `proposeWorkoutPatch` 目标语义收敛为 `registerWorkoutPatch`，输入改为 `sourceArtifactPayloadId`、`editPlanId`、`patch`、`exerciseSourceIds` 和结构化 `requirements`。
- [ ] 5.3 移除 patch 工具中的 `candidateSetId` / `candidateExerciseIds` 依赖，从 `exerciseSourceIds` 恢复允许动作。
- [ ] 5.4 确保 patch 工具不根据自然语言生成 replacement 或自动保存 artifact。

## 6. Validation / Policy / Save 边界重构

- [ ] 6.1 调整 `validateRoutineDraft`，只消费 `draftId`、结构化 `requirements` 和 `validationProfile`，不接收 `candidateSetId`、`candidateExerciseIds` 或 `intent`。
- [ ] 6.2 调整 `validatePlanDraft`，只消费 `draftId`、结构化 `requirements` 和 `validationProfile`，不接收 `candidateSetId`、`candidateExerciseIds` 或 `intent`。
- [ ] 6.3 调整 `validateWorkoutPatch`，只消费 `patchId`、结构化 `requirements` 和 `validationProfile`，不接收 raw patch 或候选集合字段。
- [ ] 6.4 调整 validation recovery，使失败恢复只要求 LLM repair、重新搜索动作、澄清或阻断，不自动补写训练语义。
- [ ] 6.5 调整 `evaluatePolicy`，统一使用 `resourceRef` + `validationId`，不接收 raw draft / patch。
- [ ] 6.6 调整 `saveConversationArtifactRevision`，统一使用 `resourceRef` + `validationId` + `policyDecisionId`，不接收 raw `payload`、`validationPassed` 或 `policyAllowed`。

## 7. DomainPlanEngine 收缩

- [ ] 7.1 移除或隔离 `buildPlanStrategyFromWorkoutIntent()` 在生产 Agent 链路中的使用。
- [ ] 7.2 删除生产路径里基于 `latestUserMessage` 的正则推断周期、频率、策略、强度、约束和递进语义。
- [ ] 7.3 将 `DomainPlanEngine` 保留为确定性 schedule / calendar preview 或一致性校验辅助。
- [ ] 7.4 更新 `domain-plan-engine` specs 和测试，确保它不再生成完整训练语义草稿。

## 8. 测试与验证

- [ ] 8.1 更新 `tests/readonly-tools.test.ts`：`searchExercises` 不再接受 `candidateUse` / `resultRequirements`，输出 `exerciseSearchResultId`。
- [ ] 8.2 增加回归测试：热身 / 拉伸搜索默认应用 no-equipment 过滤，用户明确指定器械热身 / 拉伸时不强制覆盖。
- [ ] 8.3 更新 `tests/agent-orchestrator.test.ts` 中 routine 用例，LLM 先分段搜索动作，再输入完整 LLM-authored routine draft。
- [ ] 8.4 更新 `tests/agent-orchestrator.test.ts` 中 plan 用例，LLM 输入完整 LLM-authored plan draft。
- [ ] 8.5 增加回归测试：只传 `candidateExerciseIds` 调用 routine 登记工具必须失败，不得服务端自动编排。
- [ ] 8.6 增加回归测试：只传 `strategy` 调用 plan 登记工具必须失败，不得服务端自动展开 plan。
- [ ] 8.7 增加回归测试：validation / policy / save 拒绝 raw payload、模型自报 `validationPassed` 和模型自报 `policyAllowed`。
- [ ] 8.8 增加回归测试：`DomainPlanEngine` 不得从 `latestUserMessage` 正则推断生产字段。
- [ ] 8.9 更新黑盒 LLM flow 期望，验证 LLM 会输出完整 structured routine / plan draft，并且热身、主训练、拉伸动作来源可追溯到纯搜索结果。
- [ ] 8.10 运行相关定向测试：`tests/agent-orchestrator.test.ts`、`tests/domain-plan-engine.test.ts`、`tests/workout-plan-validation.test.ts`、`tests/readonly-tools.test.ts`。
- [ ] 8.11 运行 `npm run typecheck`。
- [ ] 8.12 运行 `openspec validate realign-agent-tools-with-llm-authored-drafts --strict`。
