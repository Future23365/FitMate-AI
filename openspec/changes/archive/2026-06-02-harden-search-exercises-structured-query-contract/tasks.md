## 1. 当前工具能力审计与完成标准

- [x] 1.1 审计 `AgentToolRegistry` 中所有 read / reference / memory / plan / generate / patch / validate / policy / persistence / clarify 工具，记录每个工具能严格执行的 operation、不能执行的 operation、输入表达缺口和当前风险。
- [x] 1.2 为每个现有 tool 写出“LLM 可能想要的结果”和“当前 schema 是否能表达”的对照表，至少覆盖 `searchExercises`、`searchArtifacts`、`getUserMemory`、`generateRoutineDraft`、`proposeWorkoutPatch`、`validateRoutineDraft` 和 `saveConversationArtifactRevision`。
- [x] 1.3 明确本 change 的 Definition of Done：所有复杂 tool 必须能接收结构化 ToolRequest，成功结果必须证明满足 ToolRequest，不能满足必须结构化失败。
- [x] 1.4 标记必须新增或拆分的 tool 能力：`resolveArtifactReference`、`queryUserMemory`，以及 `searchExercises` 的结构化候选查询能力。

## 2. Agent Tool 合同基础设施

- [x] 2.1 定义 `AgentToolCapabilityContract` 类型，覆盖 `operationKind`、`supportedOperations`、`inputContract`、`executionContract`、`refusesWhen`、`produces`、`evidence`、`failureCodes` 和 `unsupportedOperations`。
- [x] 2.2 定义统一 ToolRequest 语义，区分 `operation`、`hardConstraints`、`softPreferences`、`resultRequirements` 和 `projection`。
- [x] 2.3 定义统一 ToolResult 履约语义，至少包含 `satisfied`、`producedResources`、`appliedHardConstraints`、`unmetResultRequirements`、`evidence` 和 `diagnostics`。
- [x] 2.4 为每个 tool 定义结构化失败类型，至少覆盖参数缺失、参数非法、能力不支持、资源歧义、候选不足、边界不匹配、结果要求未满足和结果不可证明。
- [x] 2.5 更新 `AgentToolRegistry` 校验：缺少 capability contract 或 failure semantics 的 tool 不得作为复杂业务 tool 暴露给模型。
- [x] 2.6 更新工具摘要生成逻辑，确保 LLM 能看到 operation、hard constraints、soft preferences、result requirements、projection、query 语义、拒绝条件和不能执行的常见操作。
- [x] 2.7 更新 `agent_tool_decision` prompt module，明确执行型 tool 调用必须使用 `operation`、结构化 `filters` 和必要 `resultRequirements`，并明确 `query` 不是 hard constraint。
- [x] 2.8 更新 `agent_tool_execution` 或等价失败恢复 prompt 边界，确保工具结构化失败或 `satisfied=false` 时只能进入 repair、retry、clarification、blocked 或 failed，不能继续消费该资源。
- [x] 2.9 确保 dependency graph、tool result resource registry、trace、prompt module 和测试共用同一份 capability contract，不复制一套描述文本。

## 3. 读工具与引用工具严格边界

- [x] 3.1 确认 `listRecentArtifacts`、`getArtifactPayload` 和 `getExerciseById` 只承担 list / exact_read 能力，不承诺复杂语义搜索。
- [x] 3.2 收紧 `searchArtifacts` 的能力合同，明确它只能按结构化 artifact filters 搜索候选；结果不唯一时返回歧义，不静默选择。
- [x] 3.3 新增或拆分 `resolveArtifactReference`，用于解析“上一套”“刚才那版”“最近保存的计划”等引用，输入包含 kind、session scope、recency、saved/generated 状态、target filters 和唯一性要求。
- [x] 3.4 收紧 `getUserMemory` 的能力合同，明确它是 memory snapshot 读取工具，不能假装完成精确 memory query。
- [x] 3.5 新增或升级 `queryUserMemory`，支持按 kind、subjectType、status、confirmed、source、limit 和 projection 查询用户记忆，并返回 coverage diagnostics。
- [x] 3.6 更新模型可见工具摘要，避免 LLM 把 snapshot、候选搜索或 exact read tool 当作精确语义解析工具。

## 4. `searchExercises` 结构化查询合同

- [x] 4.1 定义 `searchExercises` 的结构化 ToolRequest 输入类型，明确 `operation=build_exercise_candidate_set`、`candidateUse`、`filters`、`resultRequirements`、`softPreferences`、`query`、`projection` 和旧字段兼容边界。
- [x] 4.2 定义 hard filter 字段白名单和合法值校验方式，覆盖 `bodyRegions`、`allowedSections`、`equipment`、`homeRequirement`、`level`、`difficulty`、`riskTags`、`goalTags`、`movementPattern`、`intensityRole` 和可见性。
- [x] 4.3 定义 result requirements，覆盖最少候选数、section 覆盖、可用于 routine / plan / patch、必须返回 proof 和唯一性要求。
- [x] 4.4 定义 candidate set 查询证据类型，包含 `normalizedQueryInput`、`appliedFilters`、`invalidFilters`、`constraintProof`、`resultRequirementProof`、`diagnostics`、`satisfied` 和最终 exerciseIds。
- [x] 4.5 更新 `searchExercisesAgentToolInputSchema` 和模型可见工具摘要，使执行型 `candidateUse` 必须传结构化 filters 和必要 result requirements，不能只依赖裸 query。
- [x] 4.6 实现输入规范化与旧字段兼容解析；旧 `equipment`、`equipmentRequired`、`equipmentAvoided` 等显式结构化字段可映射到新 filters，`query`、`preferences`、`avoidances` 不得被解析成隐藏 hard filter。
- [x] 4.7 在 `searchExercises` 执行前校验字段白名单、合法 enum 和动作库真实 facet；未知字段或无效 facet 不得静默丢弃。
- [x] 4.8 更新 hard filter 执行逻辑，确保不满足结构化 filters 的动作不会进入最终候选集合，text/vector/RAG score 不得绕过 hard filters。
- [x] 4.9 更新 query mode，使执行型候选中的 query 只能作为召回或排序信号，不能承载或替代 hard filters。
- [x] 4.10 为成功结果输出 candidate set 查询证据和 `satisfied=true`，为失败结果输出可恢复 diagnostics；候选不足或 result requirements 未满足不得自动放宽 hard filters。

## 5. 候选边界传递与生成工具约束

- [x] 5.1 在 Agent runtime 或 tool result 资源登记中保存 candidate set 查询证据和 ToolResult 履约状态，后续工具可按 `candidateSetId` 读取。
- [x] 5.2 更新 `generateRoutineDraft`，校验传入 `candidateSetId` 来自当前 run 且 `satisfied=true`，校验 `candidateExerciseIds` 来自该 candidate set，并继承查询证据和 result requirements。
- [x] 5.3 更新 routine 补动作逻辑，优先从同一 candidate set 选择补充动作；缺少必要 section 时用同一 hard filters 重新补查并登记 proof，或返回可恢复失败。
- [x] 5.4 更新 `generatePlanDraft`，确保 seed routine、计划展开和候选动作都不越过 candidate set 查询边界或 result requirements。
- [x] 5.5 更新 `proposeWorkoutEditPlan`，明确它只登记和校验 LLM 提交的结构化 edit plan，不从自然语言自行推导 patch 语义。
- [x] 5.6 更新 `proposeWorkoutPatch`，校验 replacement 来自满足查询证据的候选集合，并记录 patch proof。
- [x] 5.7 禁止生成类工具通过 title、summary、coach notes 或 response writer 声称满足未被 evidence 证明的约束。

## 6. 校验、Policy、保存和恢复

- [x] 6.1 为 routine、plan 和 patch 校验新增查询边界验证，违反时返回稳定错误码，例如 `candidate_query_boundary_mismatch`。
- [x] 6.2 为 routine、plan 和 patch 校验新增 result requirement 验证，违反时返回 `result_requirement_unmet` 或等价错误码。
- [x] 6.3 确保 validator 只消费来自当前 Agent run 或当前用户可访问范围、且 `satisfied=true` 的上游 tool result。
- [x] 6.4 将查询边界违反和 result requirement 未满足接入训练生成恢复分类，优先引导 Agent 使用合法结构化 filters 和 result requirements 重新调用 `searchExercises`。
- [x] 6.5 确认 `evaluatePolicy` 只评估已登记资源，不补齐 draft、patch、validation 或保存事实。
- [x] 6.6 确认 `saveConversationArtifactRevision` 只保存已通过 validation 和 policy 且上游 ToolResult 可证明满足 hard contract 的资源。
- [x] 6.7 确保恢复流程不隐式放宽 hard constraints；任何放宽都必须由 LLM 通过新 ToolRequest 显式提交或向用户澄清。

## 7. Trace、Response Writer 和文档

- [x] 7.1 更新 Agent trace / diagnostics，展示每个 tool 的 operationKind、operation、输入摘要、拒绝原因、satisfied 状态、产出资源和关键 evidence。
- [x] 7.2 更新黑盒报告摘要，区分 LLM 参数错误、tool 能力不足、候选不足、result requirement 未满足、hard boundary 失败和保存失败。
- [x] 7.3 更新 Response Writer 摘要，确保用户可见成功结果不会声称满足未被工具 evidence 证明的约束。
- [x] 7.4 更新 `docs/方案变更历史` 和 `docs/项目演变历程.md`，记录本次 Tool-first 工具能力合同收紧的原因、旧方案问题和新边界。

## 8. 自动化测试与验证

- [x] 8.1 增加 tool registry 测试：所有 Agent tools 都声明 capability contract，模型可见摘要来自同一份合同。
- [x] 8.2 增加 ToolRequest / ToolResult 测试：参数缺失、参数非法、能力不支持、资源歧义、结果要求未满足和结果不可证明时 tool 必须失败，不能静默成功。
- [x] 8.3 增加 schema 摘要测试：operation、hard constraints、result requirements、关键 enum 和 query 语义不会被 token 瘦身隐藏。
- [x] 8.4 增加 prompt module 测试：`agent_tool_decision` 必须保留执行型 ToolRequest 的 `operation`、`filters`、`resultRequirements`、`query` 非 hard constraint 和结构化失败修复规则。
- [x] 8.5 增加 `searchExercises` 单元测试：无器械、指定器械、风险排除、难度、section、无效 facet、裸 query 执行型失败、section 覆盖不足和 result requirement 未满足。
- [x] 8.6 增加 Agent tool 测试：模型传合法结构化 filters 和 result requirements 时返回 candidate set 查询证据；传无效 filters 时返回可恢复 diagnostics。
- [x] 8.7 增加 `searchArtifacts` / `resolveArtifactReference` 测试：引用结果不唯一、引用无法表达或候选证据不足时必须返回歧义、unsupported 或澄清。
- [x] 8.8 增加 `getUserMemory` / `queryUserMemory` 测试：snapshot 不得伪装成结构化查询；memory filters 无法证明覆盖时返回 `unverifiable_result`。
- [x] 8.9 增加 routine 生成测试：补 warmup / stretch 时不得从全量动作库补入违反查询边界的动作。
- [x] 8.10 增加 plan / patch 测试：计划展开和 replacement 动作必须满足 candidate set 查询证据和 result requirements。
- [x] 8.11 增加 validator 测试：候选集合内但违反查询边界或 result requirements 的动作必须 hard fail，不能作为 warning 放过。
- [x] 8.12 增加 tool request replay 测试：复现“换一套没有器械的” trace，验证 LLM 传入结构化 filters 后最终 routine 不包含器械动作，并记录 tool diagnostics。
- [x] 8.13 增加真实模型黑盒或详细套件场景：用户要求“换一套没有器械的”时，最终 routine 不得包含器械动作，且报告能说明 search/generate/validate 的 evidence。
- [x] 8.14 运行 `npm test` 或相关测试子集，并按需运行 `npm run typecheck`。
- [x] 8.15 运行 `openspec validate harden-search-exercises-structured-query-contract --strict`，确认 proposal、design、spec 和 tasks 可归档。
