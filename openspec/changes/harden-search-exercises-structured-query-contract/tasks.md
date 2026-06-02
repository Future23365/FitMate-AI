## 1. 工具审计与结构化查询合同

- [ ] 1.1 审计 `AgentToolRegistry` 中所有读工具、生成工具、校验工具和保存工具，记录哪些工具会生成或消费执行型 candidate set。
- [ ] 1.2 定义 `searchExercises` 的结构化查询输入类型，明确 hard filter 字段、query 字段、candidateUse 和旧字段兼容边界。
- [ ] 1.3 定义动作库 facet 白名单和合法值校验方式，覆盖 `bodyRegions`、`allowedSections`、`equipment`、`homeRequirement`、`level`、`difficulty`、`riskTags`、`goalTags`、`movementPattern` 和 `intensityRole`。
- [ ] 1.4 定义 candidate set 查询证据类型，包含 `normalizedQueryInput`、`appliedFilters`、`invalidFilters`、`constraintProof`、`diagnostics` 和最终 exerciseIds。
- [ ] 1.5 明确 `searchArtifacts` 的同类风险并记录为后续范围，不在本 change 修改 artifact search 行为。

## 2. `searchExercises` 严格查询执行

- [ ] 2.1 更新 `searchExercisesAgentToolInputSchema` 和模型可见工具摘要，使执行型 candidateUse 必须传结构化 filters，不能只依赖裸 query。
- [ ] 2.2 实现输入规范化与旧字段兼容解析，确保旧 `equipment`、`equipmentRequired`、`equipmentAvoided` 等字段能映射到新结构化 filters 或返回可恢复失败。
- [ ] 2.3 在 `searchExercises` 执行前校验字段白名单、合法 enum 和动作库真实 facet；未知字段或无效 facet 不得静默丢弃。
- [ ] 2.4 更新 hard filter 执行逻辑，确保不满足结构化 filters 的动作不会进入最终候选集合。
- [ ] 2.5 更新 query mode，使执行型候选中的 query 只能作为召回或排序信号，不能承载或替代 hard filters。
- [ ] 2.6 为成功结果输出 candidate set 查询证据，为失败结果输出可恢复 diagnostics。

## 3. 候选边界传递与生成工具约束

- [ ] 3.1 在 Agent runtime 或 tool result 资源登记中保存 candidate set 查询证据，后续工具可按 `candidateSetId` 读取。
- [ ] 3.2 更新 `generateRoutineDraft`，校验传入 `candidateExerciseIds` 来自本轮 candidate set，并继承查询证据。
- [ ] 3.3 更新 routine 补动作逻辑，优先从同一 candidate set 选择补充动作；缺少必要 section 时用同一查询边界重新补查或返回可恢复失败。
- [ ] 3.4 更新 `generatePlanDraft`，确保 seed routine、计划展开和候选动作都不越过 candidate set 查询边界。
- [ ] 3.5 更新 `proposeWorkoutPatch` 和 `validateWorkoutPatch`，确保 replacement 动作来自满足查询证据的候选集合。

## 4. 校验、恢复和 Trace

- [ ] 4.1 为 routine、plan 和 patch 校验新增查询边界验证，违反时返回稳定错误码，例如 `candidate_query_boundary_mismatch`。
- [ ] 4.2 将查询边界违反接入训练生成恢复分类，优先引导 Agent 使用合法结构化 filters 重新调用 `searchExercises`。
- [ ] 4.3 更新 Agent trace / diagnostics，展示结构化 filters、invalidFilters、constraintProof、filteredCount、returnedCount 和 queryMode。
- [ ] 4.4 更新 Response Writer 或黑盒报告摘要，确保用户可见成功结果不会声称满足未被查询证据证明的约束。
- [ ] 4.5 更新 `docs/方案变更历史` 和 `docs/项目演变历程.md`，记录本次工具查询合同收紧的原因和边界。

## 5. 自动化测试与验证

- [ ] 5.1 增加 `searchExercises` 单元测试：无器械、指定器械、风险排除、难度、section、无效 facet 和裸 query 执行型失败。
- [ ] 5.2 增加 Agent tool 测试：模型传合法结构化 filters 时返回 candidate set 查询证据；传无效 filters 时返回可恢复 diagnostics。
- [ ] 5.3 增加 routine 生成测试：补 warmup / stretch 时不得从全量动作库补入违反查询边界的动作。
- [ ] 5.4 增加 plan / patch 测试：计划展开和 replacement 动作必须满足 candidate set 查询证据。
- [ ] 5.5 增加 validator 测试：候选集合内但违反查询边界的动作必须 hard fail，不能作为 warning 放过。
- [ ] 5.6 增加真实模型黑盒或详细套件场景：用户要求“换一套没有器械的”时，最终 routine 不得包含器械动作，并记录 tool diagnostics。
- [ ] 5.7 运行 `npm test` 或相关测试子集，并按需运行 `npm run typecheck`。
- [ ] 5.8 运行 `openspec validate harden-search-exercises-structured-query-contract --strict`，确认 proposal、design、spec 和 tasks 可归档。
