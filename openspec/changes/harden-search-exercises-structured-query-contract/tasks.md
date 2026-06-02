## 1. Agent Tool 能力合同与全量审计

- [ ] 1.1 审计 `AgentToolRegistry` 中所有 read / plan / generate / validate / policy / persistence / clarify 工具，记录每个工具能严格执行的操作、不能执行的操作和当前风险。
- [ ] 1.2 定义 `AgentToolCapabilityContract` 类型，覆盖 `operationKind`、`inputContract`、`executionContract`、`refusesWhen`、`produces`、`evidence` 和 `unsupportedOperations`。
- [ ] 1.3 为现有所有 Agent tools 补 capability contract，并让 registry、模型可见工具摘要、dependency graph 和 trace 使用同一份合同。
- [ ] 1.4 为每个 tool 定义结构化失败类型，至少覆盖参数缺失、参数非法、能力不支持、资源歧义、候选不足、边界不匹配和结果不可证明。
- [ ] 1.5 更新工具摘要生成逻辑，确保 LLM 能看到 tool 的 hard contract、query 语义、拒绝条件和不能执行的常见操作。

## 2. 读工具严格执行边界

- [ ] 2.1 定义 `searchExercises` 的结构化查询输入类型，明确 hard filter 字段、query 字段、candidateUse 和旧字段兼容边界。
- [ ] 2.2 定义动作库 facet 白名单和合法值校验方式，覆盖 `bodyRegions`、`allowedSections`、`equipment`、`homeRequirement`、`level`、`difficulty`、`riskTags`、`goalTags`、`movementPattern` 和 `intensityRole`。
- [ ] 2.3 定义 candidate set 查询证据类型，包含 `normalizedQueryInput`、`appliedFilters`、`invalidFilters`、`constraintProof`、`diagnostics` 和最终 exerciseIds。
- [ ] 2.4 审计并收紧 `searchArtifacts` 的能力合同，明确它能严格执行的 artifact filters、资源歧义返回和不支持的引用语义。
- [ ] 2.5 审计并收紧 `getUserMemory` 的能力合同，明确 snapshot 与结构化 memory query 的边界；当前参数表达不了的记忆查询必须返回不支持或澄清。
- [ ] 2.6 确认 `listRecentArtifacts`、`getArtifactPayload` 和 `getExerciseById` 只承担 list / exact_read 能力，不承诺复杂语义搜索。

## 3. `searchExercises` 严格查询执行

- [ ] 3.1 更新 `searchExercisesAgentToolInputSchema` 和模型可见工具摘要，使执行型 candidateUse 必须传结构化 filters，不能只依赖裸 query。
- [ ] 3.2 实现输入规范化与旧字段兼容解析，确保旧 `equipment`、`equipmentRequired`、`equipmentAvoided` 等字段能映射到新结构化 filters 或返回可恢复失败。
- [ ] 3.3 在 `searchExercises` 执行前校验字段白名单、合法 enum 和动作库真实 facet；未知字段或无效 facet 不得静默丢弃。
- [ ] 3.4 更新 hard filter 执行逻辑，确保不满足结构化 filters 的动作不会进入最终候选集合。
- [ ] 3.5 更新 query mode，使执行型候选中的 query 只能作为召回或排序信号，不能承载或替代 hard filters。
- [ ] 3.6 为成功结果输出 candidate set 查询证据，为失败结果输出可恢复 diagnostics。

## 4. 候选边界传递与生成工具约束

- [ ] 4.1 在 Agent runtime 或 tool result 资源登记中保存 candidate set 查询证据，后续工具可按 `candidateSetId` 读取。
- [ ] 4.2 更新 `generateRoutineDraft`，校验传入 `candidateExerciseIds` 来自本轮 candidate set，并继承查询证据。
- [ ] 4.3 更新 routine 补动作逻辑，优先从同一 candidate set 选择补充动作；缺少必要 section 时用同一查询边界重新补查或返回可恢复失败。
- [ ] 4.4 更新 `generatePlanDraft`，确保 seed routine、计划展开和候选动作都不越过 candidate set 查询边界。
- [ ] 4.5 更新 `proposeWorkoutEditPlan`，明确它只登记和校验 LLM 提交的结构化 edit plan，不从自然语言自行推导 patch 语义。
- [ ] 4.6 更新 `proposeWorkoutPatch` 和 `validateWorkoutPatch`，确保 replacement 动作来自满足查询证据的候选集合。

## 5. 校验、Policy、保存和 Trace

- [ ] 5.1 为 routine、plan 和 patch 校验新增查询边界验证，违反时返回稳定错误码，例如 `candidate_query_boundary_mismatch`。
- [ ] 5.2 将查询边界违反接入训练生成恢复分类，优先引导 Agent 使用合法结构化 filters 重新调用 `searchExercises`。
- [ ] 5.3 确认 `evaluatePolicy` 只评估已登记资源，不补齐 draft、patch、validation 或保存事实。
- [ ] 5.4 确认 `saveConversationArtifactRevision` 只保存已通过 validation 和 policy 的资源，不能保存未证明满足 hard contract 的结果。
- [ ] 5.5 更新 Agent trace / diagnostics，展示每个 tool 的 operationKind、输入摘要、拒绝原因、产出资源和关键 evidence。
- [ ] 5.6 更新 Response Writer 或黑盒报告摘要，确保用户可见成功结果不会声称满足未被工具 evidence 证明的约束。
- [ ] 5.7 更新 `docs/方案变更历史` 和 `docs/项目演变历程.md`，记录本次 Tool-first 工具能力合同收紧的原因和边界。

## 6. 自动化测试与验证

- [ ] 6.1 增加 tool registry 测试：所有 Agent tools 都声明 capability contract，模型可见摘要来自同一份合同。
- [ ] 6.2 增加严格执行测试：参数缺失、参数非法、能力不支持、资源歧义和结果不可证明时 tool 必须失败，不能静默成功。
- [ ] 6.3 增加 `searchExercises` 单元测试：无器械、指定器械、风险排除、难度、section、无效 facet 和裸 query 执行型失败。
- [ ] 6.4 增加 Agent tool 测试：模型传合法结构化 filters 时返回 candidate set 查询证据；传无效 filters 时返回可恢复 diagnostics。
- [ ] 6.5 增加 `searchArtifacts` / `getUserMemory` 测试：参数无法表达的引用或记忆查询必须返回不支持、歧义或澄清，而不是伪装命中。
- [ ] 6.6 增加 routine 生成测试：补 warmup / stretch 时不得从全量动作库补入违反查询边界的动作。
- [ ] 6.7 增加 plan / patch 测试：计划展开和 replacement 动作必须满足 candidate set 查询证据。
- [ ] 6.8 增加 validator 测试：候选集合内但违反查询边界的动作必须 hard fail，不能作为 warning 放过。
- [ ] 6.9 增加真实模型黑盒或详细套件场景：用户要求“换一套没有器械的”时，最终 routine 不得包含器械动作，并记录 tool diagnostics。
- [ ] 6.10 运行 `npm test` 或相关测试子集，并按需运行 `npm run typecheck`。
- [ ] 6.11 运行 `openspec validate harden-search-exercises-structured-query-contract --strict`，确认 proposal、design、spec 和 tasks 可归档。
