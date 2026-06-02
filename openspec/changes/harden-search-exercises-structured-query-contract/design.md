## Context

当前 `/api/chat` 已切到 Tool-first `AgentOrchestrator`。LLM 通过 `AgentToolRegistry` 调用 `searchExercises`、`generateRoutineDraft`、`validateRoutineDraft`、`evaluatePolicy` 和 `saveConversationArtifactRevision` 完成 routine 生成链路。

最新 trace 暴露的问题是：LLM 已经知道要查“无器械上肢训练”，但它把查询表达成 `query="上肢训练 无器械"` 和不完整的 `equipmentAvoided`。`searchExercises` 对执行型 routine 候选只要求“有一些结构化字段”，没有要求这些字段足够表达用户约束；后续 `generateRoutineDraft` 又把候选当作合法事实，`validateRoutineDraft` 也没有证明最终动作满足本轮查询边界。

这说明当前工具边界设计得太松：LLM 负责语义理解没有问题，但它还被迫理解动作库底层字段如何组合；服务端也没有把候选集合的查询事实保存下来供后续工具继承。

## Goals / Non-Goals

**Goals:**

- 让 LLM 直接传入具体、结构化、白名单内的动作查询参数。
- 让 `searchExercises` 严格按查询参数执行 hard filters，并返回候选集合查询证据。
- 让 `generateRoutineDraft`、`generatePlanDraft`、`proposeWorkoutPatch` 和 validator 继承 candidate set 的查询边界。
- 对其它 Agent tool 做同类风险审计，明确哪些需要纳入本 change，哪些只记录后续风险。
- 保持服务端只做确定性合同执行，不从用户原文做关键词判断或语义改写。

**Non-Goals:**

- 不实现服务端自然语言理解、关键词分流、同义词判断或文本规则归一化。
- 不引入外部向量数据库、pgvector 或新 embedding 服务。
- 不修改 Prisma Schema。
- 不改变 `searchArtifactsDetailed` 的行为；本 change 只记录 artifact search 的同类风险。
- 不要求服务端保证 LLM 对所有自然语言语义都理解正确；本 change 只保证 LLM 传出的结构化查询被严格执行、继承和校验。

## Decisions

### 1. `searchExercises` 改为结构化查询执行器

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

### 2. 服务端只校验白名单字段和合法 facet，不读用户原文

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

### 3. 执行型 candidate set 必须带查询证据

`candidateSet` 不能只表示 `exerciseIds`。执行型 `candidateUse=recommendation/routine/plan/patch` 的成功输出必须包含：

- `normalizedQueryInput`: 规范化后的工具输入。
- `appliedFilters`: 实际执行的 hard filters。
- `invalidFilters`: 不合法或无法执行的过滤字段。
- `constraintProof`: 每个返回动作满足哪些 filters 的摘要。
- `candidateSetId`: 与该规范化输入绑定的候选集合 id。
- `diagnostics`: filteredCount、returnedCount、queryMode、failureReasons 等。

后续生成、Patch、校验和 trace 都引用这份证据，而不是让模型重新复述过滤条件。

### 4. 生成和补动作必须继承 candidate set 查询边界

`generateRoutineDraft` 当前会保留模型传入的候选动作，并在缺少 warmup / stretch 时从全量动作库补动作。这个行为需要改为：

- 首选只从当前 candidate set 的合法候选中选择和补动作。
- 如果 candidate set 缺少必要 section，必须用同一 `normalizedQueryInput` 重新补查对应 section，或返回可恢复失败。
- 重新补查得到的新候选必须合并到同一个查询边界下，并继续输出证据。
- 禁止从全量动作库补入没有通过本轮 filters 的动作。

`generatePlanDraft` 和 `proposeWorkoutPatch` 也必须验证使用的动作来自对应 candidate set，并且没有越过 candidate set 的查询证据。

### 5. Validator 对查询边界做确定性证明

`validateRoutineDraft`、`validatePlanDraft` 和 `validateWorkoutPatch` 必须能读取或接收 candidate set 查询证据，并校验最终动作仍满足这份证据。违反查询边界属于确定性 hard fail，而不是训练合理性 warning。

示例：

- candidate set 的 `homeRequirements=["no_equipment"]`，最终动作出现 `homeRequirement="equipment"`，必须失败。
- candidate set 的 `riskTagsNotIn=["high_impact"]`，最终动作出现 `high_impact`，必须失败。
- candidate set 的 `allowedSections=["training"]` 被用于 patch 替代候选时，replacement 必须来自该合法候选集合。

这不是服务端重新判断自然语言语义；它只校验工具查询事实和数据库动作元数据是否一致。

### 6. 其它 tool 风险审计

当前 Agent tools 的同类风险如下：

- 高风险：`searchExercises`。它既接收半自然语言 query，又生成后续写工具依赖的 candidate set，是本 change 的核心。
- 高风险：`generateRoutineDraft` / `generatePlanDraft`。它们会把 candidate ids 转成可保存草稿，且当前存在补动作越过候选查询边界的风险。
- 高风险：`proposeWorkoutPatch` / `validateWorkoutPatch`。它们依赖 replacement candidate set；如果 search 查错或验证只看 id 是否在数组里，patch 会把错误替代动作合法化。
- 中风险：`searchArtifacts`。它也使用 `query + targetGoal/equipmentRequired/equipmentAvoided/sessionMinutes` 搜索 artifact，但 artifact 搜索主要用于引用定位，且已有 userId/sessionScope/kind 权限边界。本 change 只记录同类风险，不改变 artifact search 行为。
- 低风险：`listRecentArtifacts`、`getArtifactPayload`、`getExerciseById`、`getUserMemory`。这些工具按当前用户上下文和 ID / limit 读取事实，不负责把领域语义编译成候选集合。
- 低风险：`evaluatePolicy`、`saveConversationArtifactRevision`。这些工具引用已登记资源和 policy / validation 结果，本身不查动作候选；它们应继续依赖 validator 的查询边界证明。

### 7. 与现有 change 的边界

`optimize-exercise-search-ranking-runtime` 处理排序、缓存、query mode 和性能；本 change 处理“执行型结构化查询合同”和“候选查询证据”。实现时可以共享 diagnostics 字段，但不把排序优化作为前置。

`harden-agent-contract-repair-loop` 处理错误反馈和修复循环；本 change 只定义哪些查询合同失败需要产生可恢复 failure。具体 repair turn 编排可由该 change 的机制承接。

## Risks / Trade-offs

- [Risk] tool schema 变大，模型更容易漏填字段。→ Mitigation: 模型摘要按候选用途展示必填 filters，schema validation failure 进入 repair；执行型候选不能用裸 query 降级成功。
- [Risk] 合法 facet 严格校验导致候选短期减少。→ Mitigation: diagnostics 返回 invalid filters、available facets 和 retryable failure，让 LLM 重查或澄清。
- [Risk] 查询证据和 trace 增加 token / 日志体积。→ Mitigation: 模型可见只保留过滤摘要、候选 id 和简短 proof；完整 proof 留 trace，按现有长度预算裁剪。
- [Risk] 修改 candidate set 输出会影响多个工具测试。→ Mitigation: 分阶段实现，先保持旧字段兼容，同时新增 `normalizedQueryInput` 和 `constraintProof`。
- [Risk] 与 ranking change 互相影响定位。→ Mitigation: 本 change 的测试以 hard filter 和 proof 为主，不依赖具体排序 Top 1，除非排序 change 已完成。

## Migration Plan

1. 定义结构化动作查询输入 schema 和 candidate set 查询证据类型，保留旧字段的兼容解析但模型可见摘要切到新字段。
2. 修改 `searchExercises` 工具执行：校验白名单字段、合法 facet、执行 hard filters、输出 proof 和 diagnostics。
3. 修改 routine / plan / patch 生成工具，确保 candidate set 查询证据被登记、继承和校验。
4. 修改 workout validator，将查询边界违反作为 hard fail，并接入可恢复失败分类。
5. 更新 trace / 黑盒报告字段，让报告能说明候选集合按哪些 filters 查询、哪些动作违反 proof。
6. 增加单元测试、Agent 工具测试和黑盒流程。先覆盖无器械 trace，再覆盖器械要求、风险排除、难度、section 和 patch 替换。
7. 如果上线后发现模型频繁漏填 filters，可临时降低某些非关键 filters 的必填要求，但不得让执行型候选用裸 query 伪装成功。

## Open Questions

无。当前方案选择“LLM 传具体查询参数，`searchExercises` 严格执行”，不引入服务端自然语言判断。
