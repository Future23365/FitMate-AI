# Agent Tool 合同审计

## 审计结论

本 change 重新审计全部当前 Agent Tool。核心结论是：Tool-first 不是把更多业务判断塞进 Tool，而是让 Tool 变成清晰、可校验、可审计的执行单元。

目标边界：

- LLM 负责自然语言理解、训练语义决策、动作归类、训练日安排、patch 语义和 structured draft 输出。
- Tool 负责读取事实、执行结构化检索、登记 LLM-authored 资源、做确定性校验、做 Policy 决策和保存。
- 搜索类 Tool 只搜索事实库，不携带 `candidateUse`、`sectionCoverage`、`minCandidates`、`satisfied` 这类编排层字段。
- 生成类 Tool 不再生成业务草稿，改为登记 LLM 已经输出的 structured draft；目标名称应从 `generate*` 收敛为 `register*`，如需分阶段迁移，旧名称只能作为兼容 alias，语义必须按登记工具执行。
- Validation 负责判断 draft / patch 是否满足确定性约束；如果不满足，只返回结构化错误和 repair guidance，不自动补写训练语义。

## 总览表

| Tool | 目标分类 | 是否需要重设计 | 目标边界 |
| --- | --- | --- | --- |
| `listRecentArtifacts` | Artifact 读取 | 否 | 列出最近 artifact 摘要，不解析引用语义 |
| `searchArtifacts` | Artifact 搜索 | 是，小重构 | 纯 artifact 检索，移除 `candidateUse` 等编排用途字段 |
| `resolveArtifactReference` | Artifact 引用解析 | 否 | 按 LLM 给出的结构化引用条件解析唯一 artifact |
| `getArtifactPayload` | Artifact 读取 | 否 | 读取可访问 artifact payload |
| `getExerciseById` | Exercise 读取 | 否 | 按 id 读取单个动作详情 |
| `searchExercises` | Exercise 搜索 | 是，重点重构 | 纯动作库检索，移除候选用途、覆盖要求和生成前置校验 |
| `getUserMemory` | Memory 读取 | 否 | 返回用户记忆快照 |
| `queryUserMemory` | Memory 查询 | 否 | 按结构化 filters 查询记忆 |
| `proposeWorkoutEditPlan` | Edit plan 登记 | 是，命名和字段收敛 | 登记 LLM-authored edit plan，不生成 patch |
| `generateRoutineDraft` | Routine draft 登记 | 是，重点重构 | 改为 `registerRoutineDraft` 语义：登记 LLM-authored routine draft |
| `generatePlanDraft` | Plan draft 登记 | 是，重点重构 | 改为 `registerPlanDraft` 语义：登记 LLM-authored plan draft |
| `proposeWorkoutPatch` | Patch 登记 | 是，字段收敛 | 登记 LLM-authored patch，使用 search result / artifact payload 作为 evidence |
| `askClarification` | 澄清 | 否 | 返回结构化澄清请求 |
| `validateRoutineDraft` | Routine 校验 | 是，字段收敛 | 校验已登记 routine draft，不再接收 `candidateSetId` / `intent` |
| `validatePlanDraft` | Plan 校验 | 是，字段收敛 | 校验已登记 plan draft，不再接收 `candidateSetId` / `intent` |
| `validateWorkoutPatch` | Patch 校验 | 是，字段收敛 | 校验已登记 patch，不接收模型重放 patch payload |
| `evaluatePolicy` | Policy | 是，字段收敛 | 只消费已登记资源和 validation 结果，不接收 raw draft / patch |
| `saveConversationArtifactRevision` | 持久化 | 是，字段收敛 | 只保存已登记、已校验、Policy 通过的资源，不接收 raw payload |

## 共享字段语义

这些字段会在多个 Tool 中复用，必须保持含义稳定。

| 字段 | 类型 | 说明 | 边界 |
| --- | --- | --- | --- |
| `artifactSearchResultId` | string | `searchArtifacts` 返回的搜索结果资源 id | 只证明 LLM 看过这些 artifact 摘要，不代表引用已唯一解析 |
| `artifactReferenceId` | string | `resolveArtifactReference` 返回的引用解析资源 id | 代表服务端已按结构化条件解析出可访问 artifact |
| `artifactPayloadId` | string | `getArtifactPayload` 返回的 payload 资源 id | 代表本轮可被 edit / patch / save 引用的完整 artifact payload |
| `exerciseSearchResultId` | string | `searchExercises` 返回的动作搜索结果资源 id | 只代表一次纯动作检索结果，不代表 routine / plan 候选集合已经满足覆盖要求 |
| `exerciseSourceIds` | string[] | draft / patch 使用的动作来源资源 id 列表 | 可以包含 `exerciseSearchResultId`；服务端从这些资源恢复允许使用的 exerciseId |
| `draftId` | string | `registerRoutineDraft` / `registerPlanDraft` 登记后的草稿资源 id | 后续 validation / policy / save 只能消费该资源 id |
| `patchId` | string | `registerWorkoutPatch` 登记后的 patch 资源 id | 后续 validation / policy / save 只能消费该资源 id |
| `editPlanId` | string | LLM-authored edit plan 登记 id | 只描述修改计划，不等同于 patch |
| `validationId` | string | validation 工具返回的校验资源 id | 只代表对应资源的确定性校验结果 |
| `policyDecisionId` | string | `evaluatePolicy` 返回的 Policy 决策资源 id | 保存前必须和目标资源、validation 绑定一致 |
| `requirements` | object | LLM 结构化输出或已确认事实中的确定性约束 | 不得由服务端从用户原文关键词推断 |
| `projection` | object | 控制返回字段白名单 | 只影响输出字段，不改变搜索或校验语义 |

## Artifact 读取与搜索工具

### `listRecentArtifacts`

**职责：**

列出当前用户或当前会话最近的 artifact 摘要，帮助 LLM 获得可引用对象的列表。

**LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `sessionScope` | 是 | `current_session` 只查当前会话；`current_user` 查当前用户可访问范围 |
| `kind` | 否 | 限定 artifact 类型，例如 routine、plan |
| `limit` | 否 | 返回摘要数量上限 |

**服务端会做：**

- 按 `userId`、`sessionId`、`sessionScope` 和 `kind` 查询最近 artifact。
- 返回轻量摘要，不返回完整 payload。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `artifacts[]` | artifact 摘要列表 |
| `artifacts[].artifactId` | artifact id |
| `artifacts[].kind` | artifact 类型 |
| `artifacts[].title` | 标题 |
| `artifacts[].summary` | 摘要 |
| `artifacts[].updatedAt` | 更新时间 |

**禁止行为：**

- 不解析“上一套”“刚才那个”这类自然语言引用。
- 不返回完整 payload。
- 不写入任何数据。

**重构结论：**

保持现状。

### `searchArtifacts`

**职责：**

按结构化条件搜索 artifact 摘要。它是纯搜索工具，不负责决定搜索结果后续用于回答、编辑、patch 还是重新生成。

**目标 LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `query` | 否 | 文本检索词，只参与标题、摘要或索引匹配，不代表业务意图 |
| `filters.sessionScope` | 是 | `current_session` 或 `current_user` |
| `filters.kind` | 否 | artifact 类型 |
| `filters.targetGoal` | 否 | 已结构化的目标标签 |
| `filters.equipment.in` | 否 | 必须包含的器械标签 |
| `filters.equipment.notIn` | 否 | 排除的器械标签 |
| `filters.sessionMinutes` | 否 | 训练时长范围 |
| `filters.updatedAfter` | 否 | 更新时间下界 |
| `limit` | 否 | 返回数量上限 |
| `projection.fields` | 否 | 返回字段白名单 |

**需要移除的当前字段：**

| 字段 | 移除原因 |
| --- | --- |
| `candidateUse` | 搜索工具不应该知道结果后续用途 |
| `operation` | 单一 Tool 已经表达操作，不需要再传内部操作名 |

**服务端会做：**

- 校验 filters 枚举和权限范围。
- 按结构化字段和 `query` 检索 artifact 摘要。
- 登记 `artifactSearchResultId`，供后续人工可追溯，但不代表唯一引用。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `artifactSearchResultId` | 本次 artifact 搜索结果资源 id |
| `candidates[]` | artifact 摘要候选 |
| `appliedFilters` | 实际应用的 filters |
| `diagnostics` | 无结果、过滤非法、结果被截断等诊断 |

**禁止行为：**

- 不根据 `query` 判断用户要 edit / patch / regenerate。
- 不把多个候选静默解析成唯一 artifact。
- 不返回完整 artifact payload。

**重构结论：**

小重构。移除 `candidateUse`，把用途判断留给 LLM 和后续工具。

### `resolveArtifactReference`

**职责：**

按 LLM 给出的结构化引用条件解析一个可访问 artifact。它可以处理唯一性要求，但不能替 LLM 理解自然语言引用。

**LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `referenceKind` | 是 | `latest`、`previous`、`recent_saved`、`recent_generated`、`explicit_filters` |
| `sessionScope` | 是 | 查询范围 |
| `kind` | 否 | artifact 类型 |
| `artifactSearchResultId` | 否 | 限定在某次搜索结果内解析 |
| `filters` | 否 | 目标、器械、时长等结构化条件 |
| `requireUnique` | 否 | 是否要求唯一命中 |
| `limit` | 否 | 歧义时返回候选数量 |

**服务端会做：**

- 在权限范围内按结构化引用条件查询 artifact。
- `requireUnique=true` 且命中多个时返回歧义失败。
- 登记 `artifactReferenceId`。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `artifactReferenceId` | 引用解析资源 id |
| `artifactId` | 唯一解析成功时的 artifact id |
| `candidates[]` | 歧义或失败时的候选 |
| `evidence` | 命中依据 |
| `diagnostics` | 无结果、歧义、权限不满足等诊断 |

**禁止行为：**

- 不从自然语言原文猜测引用对象。
- 不静默选择多个候选中的一个。
- 不返回完整 payload。

**重构结论：**

保持现状。

### `getArtifactPayload`

**职责：**

读取一个可访问 artifact 的 active revision payload，并登记为本轮可引用资源。

**LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `artifactId` | 是 | 要读取的 artifact id |
| `artifactReferenceId` | 否 | 引用解析来源，用于绑定 evidence |
| `allowedArtifactIds` | 否 | 可选边界，防止越权或越界读取 |

**服务端会做：**

- 校验 artifact 属于当前用户可访问范围。
- 校验 `allowedArtifactIds` 或 `artifactReferenceId` 边界。
- 读取 active revision payload。
- 登记 `artifactPayloadId`。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `artifactPayloadId` | payload 资源 id |
| `requestedArtifactId` | 请求的 artifact id |
| `activeArtifactId` | 实际读取的 artifact id |
| `revisionResolution` | active revision 解析信息 |
| `kind` | artifact 类型 |
| `payload` | 完整 payload |

**禁止行为：**

- 不生成或修改 payload。
- 不绕过用户权限。
- 不把历史摘要当完整 payload。

**重构结论：**

保持现状。

## Exercise 读取与搜索工具

### `getExerciseById`

**职责：**

按数据库 id 读取一个动作详情。

**LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `exerciseId` | 是 | 动作库中的动作 id |
| `projection.fields` | 否 | 返回字段白名单 |

**服务端会做：**

- 校验动作存在且可见。
- 返回动作详情。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `exercise` | 动作详情 |
| `exercise.exerciseId` | 动作 id |
| `exercise.name` | 动作名 |
| `exercise.metadata` | 肌群、器械、难度、适用 section 等数据库事实字段 |

**禁止行为：**

- 不搜索替代动作。
- 不生成训练编排。
- 不按用户自然语言解释这个动作应该用于哪一段。

**重构结论：**

保持现状。

### `searchExercises`

**职责：**

按结构化 filters 搜索动作库。它只回答“有哪些动作满足这些动作属性条件”，不回答“这批动作是否足够生成某个 routine / plan”。

**目标 LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `query` | 否 | 文本检索词，只用于名称、别名、描述匹配或排序 |
| `filters.bodyRegions` | 否 | 身体区域，如 upper_body、lower_body、core、full_body |
| `filters.targetMuscles` | 否 | 精确目标肌群；必须使用动作库真实 facet |
| `filters.allowedSections` | 否 | 动作元数据适用段，如 `warmup`、`training`、`stretch`；这是动作属性过滤，不是 routine 覆盖要求 |
| `filters.equipment.in` | 否 | 必须包含的器械标签 |
| `filters.equipment.notIn` | 否 | 排除的器械标签 |
| `filters.homeRequirements` | 否 | 居家要求，如 `no_equipment`、`bodyweight_only`、`small_space` |
| `filters.levels` | 否 | 适用训练水平 |
| `filters.difficulty` | 否 | 难度范围或枚举 |
| `filters.riskTagsNotIn` | 否 | 排除风险标签 |
| `filters.goalTags` | 否 | 动作目标标签 |
| `filters.movementPatterns` | 否 | 动作模式 |
| `filters.intensityRoles` | 否 | 强度角色 |
| `filters.visibility` | 否 | 动作可见性 |
| `limit` | 否 | 返回动作数量上限 |
| `projection.fields` | 否 | 返回字段白名单 |

**热身 / 拉伸默认规则：**

- 当 LLM 要找热身动作时，应单独调用 `searchExercises`，传 `filters.allowedSections=["warmup"]`。
- 当 LLM 要找拉伸动作时，应单独调用 `searchExercises`，传 `filters.allowedSections=["stretch"]`。
- 对 `allowedSections` 只包含 `warmup` 或只包含 `stretch` 的搜索，如果用户没有明确指定器械热身 / 器械拉伸，Tool 可以确定性补入无器械过滤，例如 `filters.homeRequirements=["no_equipment"]` 或等价 no-equipment 约束。
- 该默认规则只影响动作属性过滤，不代表服务端决定最终 routine section。

**需要移除的当前字段：**

| 字段 | 移除原因 |
| --- | --- |
| `operation` | Tool 名已经表达搜索动作，不应再传 `build_exercise_candidate_set` |
| `candidateUse` | 搜索工具不应知道结果用于 recommendation、routine、plan 还是 patch |
| `resultRequirements.minCandidates` | “够不够生成”属于 validation / Agent loop，不属于动作库搜索 |
| `resultRequirements.sectionCoverage` | section 覆盖属于 LLM draft 和 validator，不属于动作库搜索 |
| `resultRequirements.mustBeUsableFor` | 用途可通过具体 filters 表达，不应成为编排用途字段 |
| `resultRequirements.requireProof` | proof 可以由搜索工具默认返回轻量 evidence，不应影响职责边界 |
| `resultRequirements.requireUnique` | 动作搜索通常返回列表；唯一解析应由 `getExerciseById` 或上层选择处理 |
| `candidateSetStatus` / `satisfied` | 这是生成前置状态，不属于纯搜索输出 |

**服务端会做：**

- 校验 filters 中的 facet 是否真实存在。
- 执行数据库动作过滤和排序。
- 应用热身 / 拉伸无器械默认搜索过滤。
- 登记 `exerciseSearchResultId`，保存本次返回过的 exerciseId 列表，供后续 draft / patch evidence 使用。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `exerciseSearchResultId` | 本次纯动作搜索结果资源 id |
| `exercises[]` | 动作摘要列表 |
| `exercises[].exerciseId` | 动作 id |
| `exercises[].name` | 动作名 |
| `exercises[].targetMuscles` | 目标肌群 |
| `exercises[].equipment` | 器械标签 |
| `exercises[].sections` | 动作适用 section 元数据 |
| `exercises[].difficulty` | 难度 |
| `exercises[].riskTags` | 风险标签 |
| `appliedFilters` | 实际应用的 filters，包含默认补入的 no-equipment 过滤 |
| `diagnostics` | 无结果、非法 facet、被截断、默认过滤生效等诊断 |

**禁止行为：**

- 不返回 routine / plan 编排。
- 不判断动作集合是否足够生成某个 routine / plan。
- 不返回 `candidateUse`、`satisfied`、`sectionCoverage proof` 这类编排状态。
- 不把 warmup / training / stretch 的结果合并成服务端 section pool。
- 不根据用户原文改写 filters。

**重构结论：**

重点重构。`searchExercises` 必须退回纯动作搜索。LLM 可以为了 routine 连续调用三次：一次查热身、一次查主训练、一次查拉伸；多次 Tool 调用是合理成本，职责清晰优先。

## Memory 工具

### `getUserMemory`

**职责：**

返回当前用户记忆快照，给 LLM 作为背景事实。

**LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `includePending` | 否 | 是否包含待确认记忆 |
| `limit` | 否 | 返回数量上限 |
| `projection.fields` | 否 | 返回字段白名单 |

**服务端会做：**

- 读取当前用户的 confirmed / pending 记忆。
- 返回快照 id 和记忆摘要。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `snapshotId` | memory 快照 id |
| `facts[]` | 事实类记忆 |
| `preferences[]` | 偏好类记忆 |
| `avoidances[]` | 避免事项 |
| `updatedAt` | 快照时间 |

**禁止行为：**

- 不把 pending memory 当 confirmed hard constraint。
- 不执行自然语言搜索。
- 不写入记忆。

**重构结论：**

保持现状。

### `queryUserMemory`

**职责：**

按结构化 filters 查询用户记忆。

**LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `filters.kind` | 否 | 记忆类型 |
| `filters.subjectType` | 否 | 主体类型 |
| `filters.status` | 否 | confirmed / pending 等状态 |
| `filters.confirmed` | 否 | 是否只查已确认 |
| `filters.source` | 否 | 记忆来源 |
| `limit` | 否 | 返回数量上限 |
| `projection.fields` | 否 | 返回字段白名单 |

**需要移除的当前字段：**

| 字段 | 移除原因 |
| --- | --- |
| `operation` | 单一 Tool 已表达查询语义 |

**服务端会做：**

- 按当前 `userId` 和结构化 filters 查询记忆。
- 返回匹配结果和覆盖诊断。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `memoryQueryId` | 本次记忆查询 id |
| `matchedFilters` | 实际应用 filters |
| `coverageDiagnostics` | 覆盖诊断 |
| `matchedMemories[]` | 匹配记忆 |

**禁止行为：**

- 不执行任意自然语言记忆搜索。
- 不把无匹配伪装成成功。
- 不写入记忆。

**重构结论：**

轻微收敛，移除冗余 `operation`。

## 训练资源登记工具

### `proposeWorkoutEditPlan`

**目标名称：**

`registerWorkoutEditPlan`。如果实现阶段暂时保留旧名称，语义也必须按登记工具执行。

**职责：**

登记 LLM-authored edit plan。它只保存“打算怎么改”的结构化计划，不生成 patch，不修改 artifact。

**目标 LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `sourceArtifactPayloadId` | 是 | 被修改 artifact 的 payload 资源 id |
| `targetArtifactId` | 是 | 被修改 artifact id |
| `scope` | 是 | 修改范围，如 whole_artifact、sections、days、items |
| `changes[]` | 是 | LLM 结构化描述的修改项 |
| `strategy` | 否 | LLM 明确给出的修改策略 |
| `requiredExerciseIds` | 否 | 用户明确要求保留或替换的动作 id |
| `notes` | 否 | 给后续 patch 的简短说明 |

**服务端会做：**

- 校验 `sourceArtifactPayloadId` 属于本轮且可访问。
- 校验 `targetArtifactId` 与 payload 绑定一致。
- 解析 edit plan schema。
- 登记 `editPlanId`。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `editPlanId` | edit plan 资源 id |
| `sourceArtifactPayloadId` | 来源 payload |
| `targetArtifactId` | 目标 artifact |
| `scope` | 修改范围 |
| `changes[]` | 登记后的修改项 |
| `requiredExerciseIds` | 需要后续 patch 保留或覆盖的动作 |

**禁止行为：**

- 不从用户自然语言推导额外 change。
- 不生成 patch。
- 不修改或保存 artifact。

**重构结论：**

命名和字段收敛。旧 `propose` 语义容易误导，应改为 register 语义。

### `generateRoutineDraft`

**目标名称：**

`registerRoutineDraft`。`generateRoutineDraft` 这个名称本身会误导，因为目标 Tool 不再生成 routine，只登记 LLM 已经生成的 routine draft。

**职责：**

登记 LLM-authored `WorkoutRoutineDraft`。服务端只校验结构、动作来源、权限和资源边界，不决定 section、动作顺序、组数、次数、休息或 notes。

**目标 LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `draft` | 是 | LLM 输出的完整 `WorkoutRoutineDraft` 或等价 structured sections |
| `exerciseSourceIds` | 是 | draft 中新增动作来自哪些 `exerciseSearchResultId` 或等价来源 |
| `sourceArtifactPayloadId` | 否 | 基于已有 artifact 改写或再生成时的来源 |
| `sourceEditPlanId` | 否 | 如果来自 edit plan，传对应 `editPlanId` |
| `requiredExerciseIds` | 否 | 必须出现在 draft 中的动作 id |
| `requirements` | 否 | 已结构化的确定性约束，如时长、器械、必须 section；不得由服务端从自然语言推断 |

**`draft` 至少应包含：**

| 字段 | 说明 |
| --- | --- |
| `title` | routine 标题 |
| `goal` | LLM 结构化目标 |
| `estimatedDurationMinutes` | 预计时长 |
| `sections[]` | 完整 section 列表 |
| `sections[].section` | `warmup`、`training`、`stretch` 等 |
| `sections[].items[]` | 每段动作项 |
| `items[].exerciseId` | 动作库 id |
| `items[].sets` | 组数或轮数 |
| `items[].target` | 次数、时长或强度目标 |
| `items[].rest` | 休息参数 |
| `items[].notes` | LLM 给出的执行说明 |

**服务端会做：**

- 解析 `draft` schema。
- 从 `exerciseSourceIds` 恢复本轮 LLM 可见的 exerciseId。
- 校验 draft 中所有 `exerciseId` 存在、可见，并来自允许来源或 source artifact。
- 校验 `requiredExerciseIds` 覆盖。
- 登记 `draftId`。
- 返回轻量 preflight 诊断；完整质量校验交给 `validateRoutineDraft`。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `draftKind` | 固定为 `routine` |
| `draftId` | routine draft 资源 id |
| `exerciseSourceIds` | 绑定的动作来源资源 |
| `usedExerciseIds[]` | draft 实际使用动作 |
| `draft` | 原样登记的 LLM-authored draft |
| `preflight` | schema、动作来源、required 覆盖等预检结果 |
| `recovery` | 预检失败时的结构化恢复建议 |

**禁止行为：**

- 不根据动作元数据替 LLM 分配 `warmup` / `training` / `stretch`。
- 不自动补动作形成成功 draft。
- 不生成或改写 `sets`、`target`、`rest`、`notes`。
- 不根据用户原文改写目标、器械、强度或 section。

**重构结论：**

重点重构。旧的 `candidateExerciseIds -> buildRoutineDraftFromCandidates()` 成功路径必须删除或隔离为测试 fixture helper。

### `generatePlanDraft`

**目标名称：**

`registerPlanDraft`。目标 Tool 不再生成长期计划，只登记 LLM-authored `WorkoutPlanDraft`。

**职责：**

登记 LLM-authored plan draft。服务端只校验结构、动作来源、source artifact 边界和确定性 schedule consistency，不生成训练日语义。

**目标 LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `draft` | 是 | LLM 输出的完整 `WorkoutPlanDraft` 或等价 structured plan |
| `exerciseSourceIds` | 是 | plan 中新增动作来自哪些动作搜索结果 |
| `sourceArtifactPayloadIds` | 否 | 从已有 routine / plan 派生时的来源 payload |
| `sourceEditPlanId` | 否 | 来自 edit plan 时的 `editPlanId` |
| `strategy` | 否 | LLM 结构化输出的计划策略；只能用于一致性校验 |
| `requirements` | 否 | 已结构化的确定性约束，如周期、周频率、休息日、器械 |

**`draft` 至少应包含：**

| 字段 | 说明 |
| --- | --- |
| `title` | plan 标题 |
| `horizon` | 周期或结束条件 |
| `weeklySchedule` | 每周训练日 / 休息日结构 |
| `days[]` | 计划日列表或模板 |
| `days[].dayType` | training / rest / recovery |
| `days[].sections[]` | 训练日的 sections |
| `items[].exerciseId` | 训练动作 id |
| `items[].sets` / `target` / `rest` | LLM 输出的执行参数 |
| `progression` | LLM 输出的递进策略 |

**服务端会做：**

- 解析 `draft` schema。
- 从 `exerciseSourceIds` 和 `sourceArtifactPayloadIds` 恢复允许动作边界。
- 校验 draft 中动作存在、可见、来源合法。
- 校验 plan metadata、schedule 和 `strategy` 的确定性一致性。
- 登记 `draftId`。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `draftKind` | 固定为 `plan` |
| `draftId` | plan draft 资源 id |
| `exerciseSourceIds` | 动作来源资源 |
| `sourceArtifactPayloadIds` | 来源 artifact payload |
| `usedExerciseIds[]` | plan 实际使用动作 |
| `draft` | 原样登记的 LLM-authored draft |
| `preflight` | 结构、来源、schedule 一致性预检 |
| `recovery` | 预检失败时的结构化恢复建议 |

**禁止行为：**

- 不调用 `DomainPlanEngine.expandDomainPlan()` 生成完整 plan draft。
- 不构造 seed routine 代替 LLM plan draft。
- 不根据 `latestUserMessage` 正则推断周期、周频率、强度、策略或约束。
- 不自动改写训练日、动作分布、递进策略或恢复策略。

**重构结论：**

重点重构。旧 `strategy/source routine -> expandDomainPlan()` 成功路径必须移除生产依赖。

### `proposeWorkoutPatch`

**目标名称：**

`registerWorkoutPatch`。

**职责：**

登记 LLM-authored `WorkoutPatch`。它不生成 patch，不保存 artifact。

**目标 LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `sourceArtifactPayloadId` | 是 | 被 patch 的 artifact payload |
| `editPlanId` | 否 | 来自 `registerWorkoutEditPlan` 的 edit plan |
| `patch` | 是 | LLM 输出的完整 structured patch |
| `exerciseSourceIds` | 否 | patch 中新增或替换动作的来源搜索结果 |
| `requirements` | 否 | 已结构化的确定性约束 |

**服务端会做：**

- 校验 source payload 可访问。
- 校验 `editPlanId` 与 source payload 一致。
- 解析 patch schema。
- 校验 patch 中新增 exerciseId 存在且来自 `exerciseSourceIds`。
- 登记 `patchId`。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `patchId` | patch 资源 id |
| `sourceArtifactPayloadId` | 来源 payload |
| `editPlanId` | 来源 edit plan |
| `exerciseSourceIds` | 动作来源 |
| `patch` | 原样登记的 LLM-authored patch |
| `preflight` | 结构和动作来源预检 |

**禁止行为：**

- 不根据自然语言生成 patch。
- 不选择替代动作。
- 不保存 artifact。

**重构结论：**

字段收敛。移除 `candidateSetId` / `candidateExerciseIds`，改用纯搜索返回的 `exerciseSourceIds`。

### `askClarification`

**职责：**

当结构化输入不足、引用歧义或安全边界不清时，返回需要用户回答的澄清问题。

**LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `question` | 是 | 面向用户的问题 |
| `blockingReasons[]` | 是 | 阻断原因 |
| `assistantSuggestions[]` | 否 | 可选建议选项 |
| `missingFields[]` | 否 | 缺少的结构化字段 |

**服务端会做：**

- 校验澄清结构。
- 返回澄清结果给 Agent runtime。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `question` | 原样问题 |
| `blockingReasons[]` | 阻断原因 |
| `assistantSuggestions[]` | 建议选项 |
| `missingFields[]` | 缺失字段 |

**禁止行为：**

- 不读数据。
- 不写数据。
- 不生成训练。

**重构结论：**

保持现状。

## 校验、Policy 与保存工具

### `validateRoutineDraft`

**职责：**

校验已登记 routine draft 是否满足确定性合同。它不接收模型重放的大 draft，不重新编排。

**目标 LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `draftId` | 是 | `registerRoutineDraft` 返回的 draft id |
| `requirements` | 否 | 已结构化的确定性要求，如必须 section、时长、器械、风险排除 |
| `validationProfile` | 否 | 校验强度或场景，如 save_ready、preview_only |

**需要移除的当前字段：**

| 字段 | 移除原因 |
| --- | --- |
| `candidateSetId` | 搜索工具不再产出生成候选集合；动作来源已绑定在 draft resource |
| `candidateExerciseIds` | 重复且容易被模型伪造；服务端应从 draft resource 和 search result resource 恢复 |
| `intent` | 语义字段应来自 draft / requirements，不应由 validator 重新解释 |

**服务端会做：**

- 从本轮资源恢复 routine draft。
- 校验 schema、section 完整性、动作存在性、动作来源、器械 hard constraints、风险边界、时长范围。
- 返回 validation resource。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `validationId` | validation 资源 id |
| `draftId` | 被校验 draft |
| `valid` | 是否通过 |
| `errors[]` | 阻断错误 |
| `warnings[]` | 非阻断警告 |
| `recovery` | LLM repair、重新搜索、澄清或阻断建议 |

**禁止行为：**

- 不修改 draft。
- 不自动补 warmup / stretch。
- 不根据自然语言改变目标、section 或动作。

**重构结论：**

字段收敛。Validator 只消费 `draftId` 和结构化 `requirements`。

### `validatePlanDraft`

**职责：**

校验已登记 plan draft 的结构、动作来源、schedule 和确定性约束。

**目标 LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `draftId` | 是 | `registerPlanDraft` 返回的 draft id |
| `requirements` | 否 | 已结构化周期、周频率、器械、休息日、风险约束 |
| `validationProfile` | 否 | 校验强度或场景 |

**需要移除的当前字段：**

| 字段 | 移除原因 |
| --- | --- |
| `candidateSetId` | 搜索工具不再负责生成候选集合 |
| `candidateExerciseIds` | 动作边界从 draft resource 的 `exerciseSourceIds` 恢复 |
| `intent` | validator 不应解释高层语义 |

**服务端会做：**

- 从本轮资源恢复 plan draft。
- 校验 schema、训练日结构、休息日、周期、动作来源、器械 hard constraints、schedule consistency。
- 可调用收缩后的 `DomainPlanEngine` 做确定性 schedule consistency check。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `validationId` | validation 资源 id |
| `draftId` | 被校验 draft |
| `valid` | 是否通过 |
| `errors[]` | 阻断错误 |
| `warnings[]` | 非阻断警告 |
| `recovery` | LLM repair、重新搜索、澄清或阻断建议 |

**禁止行为：**

- 不展开新 plan。
- 不自动生成训练日。
- 不从用户原文推断 plan strategy。

**重构结论：**

字段收敛。Validator 只消费已登记 draft。

### `validateWorkoutPatch`

**职责：**

校验已登记 patch 是否可以应用到 source artifact。

**目标 LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `patchId` | 是 | `registerWorkoutPatch` 返回的 patch id |
| `requirements` | 否 | 已结构化确定性约束 |
| `validationProfile` | 否 | 校验强度或场景 |

**需要移除的当前字段：**

| 字段 | 移除原因 |
| --- | --- |
| `candidateSetId` | 搜索工具不再负责 patch 候选集合 |
| `candidateExerciseIds` | 动作来源从 patch resource 的 `exerciseSourceIds` 恢复 |
| `patch` | validator 不应接收模型重放 patch payload |

**服务端会做：**

- 从本轮资源恢复 patch 和 source artifact payload。
- 校验 patch schema、target path、动作来源、冲突、权限和确定性约束。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `validationId` | validation 资源 id |
| `patchId` | 被校验 patch |
| `valid` | 是否通过 |
| `errors[]` | 阻断错误 |
| `warnings[]` | 非阻断警告 |
| `recovery` | repair、重新搜索、澄清或阻断建议 |

**禁止行为：**

- 不保存 patch。
- 不生成 replacement。
- 不修改 source artifact。

**重构结论：**

字段收敛。只消费 `patchId`。

### `evaluatePolicy`

**职责：**

对已登记且已校验的 draft / patch 做写入策略判断。

**目标 LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `operation` | 是 | `create_artifact`、`replace_artifact`、`revise_artifact`、`apply_patch` |
| `resourceRef.kind` | 是 | `routine_draft`、`plan_draft`、`workout_patch` |
| `resourceRef.id` | 是 | `draftId` 或 `patchId` |
| `validationId` | 是 | 对应资源的 validation id |
| `sourceArtifactId` | 否 | 修订或 patch 时的源 artifact |
| `artifactKind` | 否 | 新建 artifact 类型 |

**需要移除的当前字段：**

| 字段 | 移除原因 |
| --- | --- |
| `patch` | Policy 不应接收 raw patch payload |
| `draftId` / `patchId` 平铺组合 | 改为统一 `resourceRef`，减少不自洽输入 |

**服务端会做：**

- 校验 `resourceRef`、`validationId`、source artifact 绑定一致。
- 调用 PolicyEngine 判断是否允许保存、是否需要用户确认。
- 登记 `policyDecisionId`。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `policyDecisionId` | Policy 决策资源 id |
| `resourceRef` | 被评估资源 |
| `validationId` | 对应 validation |
| `policy.allowed` | 是否允许 |
| `policy.requiresConfirmation` | 是否需要确认 |
| `policy.blockingReasons[]` | 阻断原因 |

**禁止行为：**

- 不生成 draft 或 patch。
- 不保存 artifact。
- 不绕过 validation。

**重构结论：**

字段收敛。Policy 只消费资源引用，不消费 raw payload。

### `saveConversationArtifactRevision`

**职责：**

保存已登记、已校验、Policy 允许的 draft / patch 结果，创建或修订 `ConversationArtifact`。

**目标 LLM 需要传：**

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `operation` | 是 | `create_artifact`、`revise_artifact`、`apply_patch` |
| `resourceRef.kind` | 是 | `routine_draft`、`plan_draft`、`workout_patch` |
| `resourceRef.id` | 是 | `draftId` 或 `patchId` |
| `validationId` | 是 | 对应 validation id |
| `policyDecisionId` | 是 | 对应 Policy 决策 |
| `sourceArtifactId` | 否 | 修订或 patch 的源 artifact |
| `artifactKind` | 是 | 保存后的 artifact 类型 |
| `confirmationId` | 否 | Policy 要求确认时的确认 id |
| `responseMessageId` | 否 | 绑定 assistant response 的消息 id |

**需要移除的当前字段：**

| 字段 | 移除原因 |
| --- | --- |
| `payload` | 保存工具不应接收 LLM raw payload；必须从 `resourceRef` 恢复已登记 payload |
| `candidateSetId` | 搜索工具不再提供保存边界；动作来源已在 draft / patch resource 中 |
| `validationPassed=true` | 应由 `validationId` 对应资源决定，不能由 LLM 自报 |
| `policyAllowed=true` | 应由 `policyDecisionId` 对应资源决定，不能由 LLM 自报 |
| `draftId` / `patchId` 平铺组合 | 改为统一 `resourceRef` |

**服务端会做：**

- 从 `resourceRef` 恢复已登记 draft 或 patch。
- 校验 validation / policy / confirmation 与该资源绑定一致。
- 创建或修订 `ConversationArtifact`。
- 登记 revision。

**服务端返回：**

| 字段 | 说明 |
| --- | --- |
| `revisionId` | 新 revision id |
| `artifactId` | 保存后的 artifact id |
| `sourceArtifactId` | 来源 artifact |
| `artifactKind` | artifact 类型 |
| `resourceRef` | 保存来源资源 |
| `validationId` | 使用的 validation |
| `policyDecisionId` | 使用的 Policy 决策 |
| `title` | 保存后的标题 |
| `summary` | 保存摘要 |

**禁止行为：**

- 不保存未校验资源。
- 不信任 LLM 自报的 `validationPassed` / `policyAllowed`。
- 不接收 raw payload。
- 不从自然语言生成 payload。

**重构结论：**

字段收敛。保存入口必须成为“资源引用持久化”，不是“LLM 传 payload 持久化”。

## DomainPlanEngine 审计

### 当前职责

当前 `DomainPlanEngine` 会从 `PlanStrategy` 和 source artifact 展开完整 `WorkoutPlanDraft`，并包含：

- 训练日 / 休息日生成；
- schedule preview；
- progression / recovery 文案；
- 训练日模板选择；
- 强度和递进调整；
- 基于 `latestUserMessage` 的周期、频率、策略、强度和约束正则推断入口。

### 当前问题

- plan 语义由服务端生成。
- 正则推断用户原文违反语义边界。
- `generatePlanDraft` 成为服务端计划生成入口。

### 目标职责

允许：

- 校验 LLM-authored plan 与 structured strategy 一致；
- 生成确定性的 calendar / schedule preview；
- 导入时展开具体日期；
- 做不可变的数值计算。

禁止：

- 生成完整 plan draft 语义；
- 正则解释用户自然语言；
- 从 source routine 自动编长期计划内容。
