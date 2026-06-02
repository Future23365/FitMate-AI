## Context

当前 `/api/chat` 已切到 Tool-first `AgentOrchestrator`。LLM 通过 `AgentToolRegistry` 调用 `searchExercises`、`generateRoutineDraft`、`validateRoutineDraft`、`evaluatePolicy` 和 `saveConversationArtifactRevision` 完成 routine 生成链路。

最新 trace 暴露的问题是：LLM 已经知道要查“无器械上肢训练”，但它把查询表达成 `query="上肢训练 无器械"` 和不完整的 `equipmentAvoided`。`searchExercises` 对执行型 routine 候选只要求“有一些结构化字段”，没有要求这些字段足够表达用户约束；后续 `generateRoutineDraft` 又把候选当作合法事实，`validateRoutineDraft` 也没有证明最终动作满足本轮查询边界。

这说明当前工具边界设计得太松：LLM 负责语义理解没有问题，但它还被迫理解每个 tool 的底层参数如何组合才等价于用户意图；服务端也没有要求 tool 证明自己严格执行了 LLM 传入的操作。Tool-first 当前只是把调用链跑通了，还没有把“每个 tool 真实可用、严格执行、不可执行就拒绝”作为架构合同。

## Goals / Non-Goals

**Goals:**

- 为所有 Agent tools 建立统一能力合同，明确每个 tool 能执行的操作、输入参数、执行结果、拒绝条件和证据输出。
- 保证 LLM 负责传入结构化参数，tool 只负责严格执行参数，不从用户原文做语义判断，也不靠 prompt 文案猜测操作。
- 让 tool 在不能执行 LLM 所表达操作时返回结构化失败，而不是静默放宽、猜测替代或继续成功。
- 让 LLM 直接传入具体、结构化、白名单内的动作查询参数。
- 让 `searchExercises` 严格按查询参数执行 hard filters，并返回候选集合查询证据。
- 让 `generateRoutineDraft`、`generatePlanDraft`、`proposeWorkoutPatch` 和 validator 继承 candidate set 的查询边界。
- 对其它 Agent tool 做能力审计，并把必要的输入合同、拒绝条件和证据输出纳入本 change。
- 保持服务端只做确定性合同执行，不从用户原文做关键词判断或语义改写。

**Non-Goals:**

- 不实现服务端自然语言理解、关键词分流、同义词判断或文本规则归一化。
- 不引入外部向量数据库、pgvector 或新 embedding 服务。
- 不修改 Prisma Schema。
- 不要求服务端保证 LLM 对所有自然语言语义都理解正确；本 change 只保证 LLM 传出的结构化查询被严格执行、继承和校验。
- 不把 runtime 变成自动业务执行器；写入、生成和保存仍必须通过注册 tool 显式调用。

## Decisions

### 1. 每个 Agent tool 都必须有 `AgentToolCapabilityContract`

Agent tool definition 需要新增或规范化一份能力合同，至少包含：

```ts
{
  operationKind:
    | "exact_read"
    | "list"
    | "structured_search"
    | "memory_query"
    | "candidate_to_draft"
    | "patch_compile"
    | "validation"
    | "policy"
    | "persistence"
    | "clarification",
  inputContract: {
    requiredFields: string[],
    optionalFields: string[],
    acceptedFilters?: string[],
    acceptedEnums?: Record<string, string[]>,
    resourceRefs?: string[]
  },
  executionContract: string,
  refusesWhen: string[],
  produces: string[],
  evidence: string[],
  unsupportedOperations: string[]
}
```

这份合同给 runtime、模型可见工具摘要、trace 和测试共用。prompt 文案可以解释合同，但不能替代合同。

原因：Tool-first 架构要真实可用，不能只靠 LLM 读一段 description 后自行猜测 tool 能干什么。tool 必须自己声明“我能执行什么参数化操作，不能执行什么，执行成功怎么证明”。

取舍：会增加工具定义维护成本，但可以防止后续每个 trace 都靠局部 prompt 和 runtime 特例修补。

### 2. Tool 执行必须区分“参数不足”和“能力不支持”

当 LLM 传入的参数不足、字段非法、资源引用不唯一、候选不足或该 tool 根本不支持对应操作时，tool 必须返回结构化失败。失败类型至少分为：

- `missing_required_parameter`
- `invalid_parameter`
- `unsupported_operation`
- `ambiguous_resource`
- `candidate_boundary_mismatch`
- `insufficient_candidates`
- `unverifiable_result`

tool 不得用以下方式伪装成功：

- 从用户原文或 query 文本自行补语义。
- 静默丢弃无法执行的参数。
- 在候选不足时放宽 hard constraint。
- 从全量库补入没有经过上游查询证据的资源。
- 只改标题、summary 或 reply 来声称满足约束。

原因：用户真正需要的是“LLM 懂了以后 tool 能执行”。如果 tool 执行不了，系统应该显式暴露这个事实，让 Agent repair 或澄清。

### 3. Agent tools 按能力类型重新审计

当前工具按风险和合同要求划分：

- `listRecentArtifacts`: `list`。只能按当前用户、sessionScope、kind、limit 列出最近 artifact；不能承诺语义定位“上一套哑铃上肢那版”。
- `searchArtifacts`: `structured_search`。可按结构化 artifact filters 和 query 搜索；如果 LLM 需要特定版本、保存状态、最近生成但未保存等当前字段表达不了的语义，tool 必须返回不支持或要求澄清。
- `getArtifactPayload`: `exact_read`。只按可访问 artifactId 读取 payload；不能根据自然语言引用自行选 artifact。
- `getExerciseById`: `exact_read`。只按 exerciseId 读取动作详情；不能根据动作描述搜索。
- `searchExercises`: `structured_search`。必须严格执行动作 filters 并输出候选证明，是本 change 首个落地重点。
- `getUserMemory`: `memory_query`。当前实现更像快照读取；需要明确它只能返回画像/记忆摘要，若要执行“查我的某类限制/偏好/未确认记忆”，必须补结构化 filters 或返回不支持。
- `proposeWorkoutEditPlan`: `patch_compile` 或 `plan`。只能登记和校验 LLM 提交的 edit plan 结构及资源引用；不能自己从自然语言推导 patch 语义。
- `generateRoutineDraft` / `generatePlanDraft`: `candidate_to_draft`。只能把已证明的候选集合和结构化 intent 编译成 draft；不能越过候选边界。
- `proposeWorkoutPatch`: `patch_compile`。只能把已登记 edit plan、候选集合和 patch 输入编译成 patch 资源；replacement 必须满足候选证明。
- `validateRoutineDraft` / `validatePlanDraft` / `validateWorkoutPatch`: `validation`。必须证明 draft / patch 满足 schema、资源、权限、候选和查询边界。
- `evaluatePolicy`: `policy`。只对已登记资源执行 policy；不能补齐 draft、patch 或保存事实。
- `saveConversationArtifactRevision`: `persistence`。只保存已通过 validation 和 policy 的资源；不能替 validator 判断训练是否满足用户意图。
- `askClarification`: `clarification`。只生成澄清问题和建议，不执行数据查询或写入。

### 4. `searchExercises` 改为结构化查询执行器

`searchExercises` 输入继续由 LLM 决定，但输入形态必须收紧为具体过滤字段，而不是让 `query` 或自由文本偏好承载执行型 hard constraint。第一版建议保留现有字段并新增或收敛到更明确的过滤对象：

```ts
{
  candidateUse: "answer_only" | "recommendation" | "routine" | "plan" | "patch",
  filters: {
    bodyRegions?: ExerciseBodyRegion[],
    allowedSections?: ExerciseAllowedSection[],
    targetMuscles?: string[],
    equipmentIn?: string[],
    equipmentNotIn?: string[],
    homeRequirements?: string[],
    levels?: string[],
    difficulty?: ExerciseDifficulty[],
    riskTagsNotIn?: string[],
    goalTags?: string[],
    movementPatterns?: ExerciseMovementPattern[],
    intensityRoles?: ExerciseIntensityRole[],
    visibility?: "all" | "published"
  },
  query?: string,
  limit?: number
}
```

命名可在实现阶段与现有 `equipment` / `equipmentRequired` / `equipmentAvoided` 兼容，但模型可见摘要必须强调：执行型候选集合的 hard constraints 必须进入 `filters`，不能只写在 `query`。

原因：LLM 可以决定“我要查 `homeRequirements=["no_equipment"]` 的上肢 routine 候选”，但不应该依赖它每次知道 `query`、`equipmentAvoided` 和低层字段如何组合才等价于这个条件。

取舍：这会增加 tool schema 的字段数量，但能换来查询结果可测试、可追踪、可证明。

### 5. 服务端只校验白名单字段和合法 facet，不读用户原文

服务端必须只处理工具输入中的结构化字段。它可以做：

- 字段白名单校验。
- enum 校验。
- 动作库 facet 是否存在的校验。
- hard filter 执行。
- 无效字段 diagnostics 和 retryable failure。

服务端不能做：

- 读取用户原文并基于“无器械”“不要跳”等词改写查询。
- 根据 query 文本猜测用户真正想传的 filters。
- 在 LLM 没有传结构化 hard constraint 时静默补出该 constraint。

原因：这符合项目 AI 语义边界。语义理解仍由 LLM 负责，服务端只是让查询合同变得严格。

### 6. 执行型 candidate set 必须带查询证据

`candidateSet` 不能只表示 `exerciseIds`。执行型 `candidateUse=recommendation/routine/plan/patch` 的成功输出必须包含：

- `normalizedQueryInput`: 规范化后的工具输入。
- `appliedFilters`: 实际执行的 hard filters。
- `invalidFilters`: 不合法或无法执行的过滤字段。
- `constraintProof`: 每个返回动作满足哪些 filters 的摘要。
- `candidateSetId`: 与该规范化输入绑定的候选集合 id。
- `diagnostics`: filteredCount、returnedCount、queryMode、failureReasons 等。

后续生成、Patch、校验和 trace 都引用这份证据，而不是让模型重新复述过滤条件。

### 7. 生成和补动作必须继承 candidate set 查询边界

`generateRoutineDraft` 当前会保留模型传入的候选动作，并在缺少 warmup / stretch 时从全量动作库补动作。这个行为需要改为：

- 首选只从当前 candidate set 的合法候选中选择和补动作。
- 如果 candidate set 缺少必要 section，必须用同一 `normalizedQueryInput` 重新补查对应 section，或返回可恢复失败。
- 重新补查得到的新候选必须合并到同一个查询边界下，并继续输出证据。
- 禁止从全量动作库补入没有通过本轮 filters 的动作。

`generatePlanDraft` 和 `proposeWorkoutPatch` 也必须验证使用的动作来自对应 candidate set，并且没有越过 candidate set 的查询证据。

### 8. Validator 对查询边界做确定性证明

`validateRoutineDraft`、`validatePlanDraft` 和 `validateWorkoutPatch` 必须能读取或接收 candidate set 查询证据，并校验最终动作仍满足这份证据。违反查询边界属于确定性 hard fail，而不是训练合理性 warning。

示例：

- candidate set 的 `homeRequirements=["no_equipment"]`，最终动作出现 `homeRequirement="equipment"`，必须失败。
- candidate set 的 `riskTagsNotIn=["high_impact"]`，最终动作出现 `high_impact`，必须失败。
- candidate set 的 `allowedSections=["training"]` 被用于 patch 替代候选时，replacement 必须来自该合法候选集合。

这不是服务端重新判断自然语言语义；它只校验工具查询事实和数据库动作元数据是否一致。

### 9. 与现有 change 的边界

`optimize-exercise-search-ranking-runtime` 处理排序、缓存、query mode 和性能；本 change 处理“执行型结构化查询合同”和“候选查询证据”。实现时可以共享 diagnostics 字段，但不把排序优化作为前置。

`harden-agent-contract-repair-loop` 处理错误反馈和修复循环；本 change 只定义哪些查询合同失败需要产生可恢复 failure。具体 repair turn 编排可由该 change 的机制承接。

## Risks / Trade-offs

- [Risk] tool schema 变大，模型更容易漏填字段。→ Mitigation: 模型摘要按候选用途展示必填 filters，schema validation failure 进入 repair；执行型候选不能用裸 query 降级成功。
- [Risk] 合法 facet 严格校验导致候选短期减少。→ Mitigation: diagnostics 返回 invalid filters、available facets 和 retryable failure，让 LLM 重查或澄清。
- [Risk] 为所有工具补能力合同会扩大实现范围。→ Mitigation: 先完成 capability audit 和合同元数据，再按高风险链路优先落地；缺少合同的工具不得被当作可执行语义工具。
- [Risk] 工具能力描述收窄后，模型会更常遇到 unsupported operation。→ Mitigation: 这是正确失败；通过 repair/澄清让模型改用合适工具，而不是让错误结果成功。
- [Risk] 查询证据和 trace 增加 token / 日志体积。→ Mitigation: 模型可见只保留过滤摘要、候选 id 和简短 proof；完整 proof 留 trace，按现有长度预算裁剪。
- [Risk] 修改 candidate set 输出会影响多个工具测试。→ Mitigation: 分阶段实现，先保持旧字段兼容，同时新增 `normalizedQueryInput` 和 `constraintProof`。
- [Risk] 与 ranking change 互相影响定位。→ Mitigation: 本 change 的测试以 hard filter 和 proof 为主，不依赖具体排序 Top 1，除非排序 change 已完成。

## Migration Plan

1. 为所有 Agent tools 建立 capability audit 表和 `AgentToolCapabilityContract` 类型。
2. 把 tool registry、模型可见工具摘要、dependency graph 和 trace 接到同一份能力合同。
3. 定义结构化动作查询输入 schema 和 candidate set 查询证据类型，保留旧字段的兼容解析但模型可见摘要切到新字段。
4. 修改 `searchExercises` 工具执行：校验白名单字段、合法 facet、执行 hard filters、输出 proof 和 diagnostics。
5. 修改 `searchArtifacts` 和 `getUserMemory` 的能力合同：能严格执行的参数必须明确；当前不能执行的语义必须返回 unsupported 或澄清。
6. 修改 routine / plan / patch 生成工具，确保 candidate set 查询证据被登记、继承和校验。
7. 修改 workout validator，将查询边界违反作为 hard fail，并接入可恢复失败分类。
8. 更新 trace / 黑盒报告字段，让报告能说明每个 tool 接收了什么参数、执行了什么、拒绝了什么、产出了什么证据。
9. 增加单元测试、Agent 工具测试和黑盒流程。先覆盖无器械 trace，再覆盖器械要求、风险排除、难度、section、artifact 搜索、memory 查询、routine 补动作和 patch 替换。
10. 如果上线后发现模型频繁漏填 filters，可临时降低某些非关键 filters 的必填要求，但不得让执行型候选用裸 query 伪装成功。

## Open Questions

无。当前方案选择“LLM 传具体参数，tool 严格执行参数；执行不了就返回结构化失败”，不引入服务端自然语言判断。
