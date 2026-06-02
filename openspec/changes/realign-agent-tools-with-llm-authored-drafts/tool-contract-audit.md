# Agent Tool 合同审计

## 审计结论

当前 Agent Tool 分为两类：

- 符合 Tool-first 边界：读工具、候选搜索、澄清、Patch 登记、validation、policy、save 基本只做结构化执行和校验。
- 偏离 Tool-first 边界：`generateRoutineDraft`、`generatePlanDraft` 和 `DomainPlanEngine` 相关路径把服务端变成了训练语义编排器。

本 change 的目标不是继续给现有生成器补规则，而是把生成类工具改为登记 LLM-authored structured draft。服务端只校验和保存，不再决定训练语义。

## 总览表

| Tool | 当前分类 | 当前问题级别 | 目标边界 |
| --- | --- | --- | --- |
| `listRecentArtifacts` | 读取 | 低 | 列出 artifact 摘要，不做语义选择 |
| `searchArtifacts` | 检索 | 低 | 按结构化条件查候选，不解析自然语言引用 |
| `resolveArtifactReference` | 引用解析 | 低 | 按结构化引用条件解析唯一 artifact |
| `getArtifactPayload` | 读取 | 低 | 读取可访问 artifact payload |
| `getExerciseById` | 读取 | 低 | 读取动作详情 |
| `searchExercises` | 候选检索 | 中 | 返回候选池和 evidence，不返回编排 |
| `getUserMemory` | 读取 | 低 | 返回记忆快照 |
| `queryUserMemory` | 结构化查询 | 低 | 按结构化 filters 查记忆 |
| `proposeWorkoutEditPlan` | 结构化登记 | 低 | 登记 LLM-authored edit plan |
| `generateRoutineDraft` | 生成 / 登记 | 高 | 改为登记 LLM-authored routine draft |
| `generatePlanDraft` | 生成 / 登记 | 高 | 改为登记 LLM-authored plan draft |
| `proposeWorkoutPatch` | 结构化登记 | 低 | 登记 LLM-authored patch |
| `askClarification` | 澄清 | 低 | 返回结构化澄清 |
| `validateRoutineDraft` | 校验 | 低 | 校验已登记 routine draft |
| `validatePlanDraft` | 校验 | 低 | 校验已登记 plan draft |
| `validateWorkoutPatch` | 校验 | 低 | 校验已登记 patch |
| `evaluatePolicy` | Policy | 低 | 校验写入策略 |
| `saveConversationArtifactRevision` | 持久化 | 低 | 保存已校验资源 |

## 只读与候选工具

### `listRecentArtifacts`

**LLM 需要传：**

- `sessionScope`: `current_session` 或 `current_user`
- `kind`: 可选 artifact 类型
- `limit`: 返回数量

**服务端会做：**

- 按当前 `userId`、`sessionId` 和 scope 读取最近 artifact 摘要。
- 返回轻量标题、摘要、动作 id、更新时间。

**服务端返回：**

- `candidateSetId`
- `artifacts[]`

**禁止行为：**

- 不根据自然语言选择“上一套”到底是哪一套。
- 不返回完整 payload。
- 不写入任何数据。

**重构结论：**

- 保持现状。

### `searchArtifacts`

**LLM 需要传：**

- `query`: 可选文本查询
- `candidateUse`: `answer_only` / `edit_plan` / `patch` / `regenerate`
- `sessionScope`
- `kind`
- `targetGoal`
- `equipmentRequired`
- `equipmentAvoided`
- `sessionMinutes`
- `limit`

**服务端会做：**

- 按结构化字段和权限检索 artifact 候选。
- 返回候选摘要和 diagnostics。

**服务端返回：**

- `candidateSetId`
- `candidates[]`
- `diagnostics`

**禁止行为：**

- 不负责把“上一套”“刚才那个”解析成唯一 artifact。
- 不根据 query 自行决定 patch / regenerate 语义。

**重构结论：**

- 保持现状；引用解析必须交给 `resolveArtifactReference`。

### `resolveArtifactReference`

**LLM 需要传：**

- `operation="resolve_artifact_reference"`
- `referenceKind`: `latest` / `previous` / `recent_saved` / `recent_generated` / `explicit_filters`
- `sessionScope`
- `kind`
- `targetGoal`
- `equipmentRequired`
- `equipmentAvoided`
- `sessionMinutes`
- `requireUnique`
- `limit`

**服务端会做：**

- 按结构化引用条件查询 artifact 候选。
- 如果要求唯一且命中多个，返回歧义失败。

**服务端返回：**

- `artifactReferenceId`
- `artifactId`
- `candidates[]`
- `evidence`
- `diagnostics`

**禁止行为：**

- 不静默选择多个候选中的一个。
- 不从自然语言摘要重建 artifact 内容。

**重构结论：**

- 保持现状。

### `getArtifactPayload`

**LLM 需要传：**

- `artifactId`
- `allowedArtifactIds`: 可选候选边界

**服务端会做：**

- 校验 artifact 属于当前用户可访问范围。
- 恢复 active revision。
- 返回 payload 和可引用 `artifactPayloadId`。

**服务端返回：**

- `artifactPayloadId`
- `requestedArtifactId`
- `activeArtifactId`
- `revisionResolution`
- `kind`
- `payload`

**禁止行为：**

- 不生成新 payload。
- 不修改 artifact。
- 不绕过 `allowedArtifactIds`。

**重构结论：**

- 保持现状。

### `getExerciseById`

**LLM 需要传：**

- `exerciseId`

**服务端会做：**

- 从动作库读取动作详情。

**服务端返回：**

- `exercise`

**禁止行为：**

- 不搜索候选。
- 不推断替代动作。
- 不生成训练编排。

**重构结论：**

- 保持现状。

### `searchExercises`

**LLM 需要传：**

- `operation="build_exercise_candidate_set"`，执行型候选必须传。
- `candidateUse`: `answer_only` / `recommendation` / `routine` / `plan` / `patch`
- `filters`: `bodyRegions`、`allowedSections`、`targetMuscles`、`equipment.in`、`equipment.notIn`、`homeRequirements`、`levels`、`difficulty`、`riskTagsNotIn`、`goalTags`、`movementPatterns`、`intensityRoles`、`visibility`
- `resultRequirements`: `minCandidates`、`sectionCoverage`、`mustBeUsableFor`、`requireProof`、`requireUnique`
- `softPreferences`
- `projection`
- `query`
- `limit`

**服务端会做：**

- 校验 facet 和结构化 filters。
- 执行动作库检索。
- 返回候选集合、候选证明和 result requirement proof。
- 对 routine / plan 可返回 warmup / training / stretch 适用性候选池，但这只是候选提示和校验证据。

**服务端返回：**

- `candidateSetId`
- `candidateUse`
- `candidateSetStatus`
- `satisfied`
- `candidates[]`
- `candidateSetEvidence`
- `unmetResultRequirements`
- `resultRequirementProof`
- `recoveryOptions`
- `diagnostics`

**禁止行为：**

- 不返回最终训练编排。
- 不决定哪些动作最终属于热身、主训练或拉伸。
- 不保存动作或 artifact。
- 不用 query 覆盖结构化 hard filters。

**重构结论：**

- 保留为候选检索工具。
- 可扩展 suitability pools，但 pools 只能给 LLM 使用，不能让服务端直接按 pool 生成 routine。

### `getUserMemory`

**LLM 需要传：**

- `includePending`
- `limit`

**服务端会做：**

- 读取当前用户画像和记忆快照。

**服务端返回：**

- `snapshotId`
- `facts`
- `preferences`
- `avoidances`
- `updatedAt`

**禁止行为：**

- 不做精确 memory query。
- 不把 pending memory 当成 confirmed hard constraint。

**重构结论：**

- 保持现状。

### `queryUserMemory`

**LLM 需要传：**

- `operation="query_user_memory"`
- `filters.kind`
- `filters.subjectType`
- `filters.status`
- `filters.confirmed`
- `filters.source`
- `limit`
- `projection`

**服务端会做：**

- 按结构化字段查询当前用户记忆。
- 返回覆盖诊断。

**服务端返回：**

- `memoryQueryId`
- `matchedFilters`
- `coverageDiagnostics`
- `matchedMemories[]`

**禁止行为：**

- 不执行任意自然语言记忆搜索。
- 不把无匹配伪装成成功。

**重构结论：**

- 保持现状。

## 训练生成、Patch、校验与保存工具

### `proposeWorkoutEditPlan`

**LLM 需要传：**

- `sourceArtifactPayloadId`
- `targetArtifactId`
- `changes`
- `scope`
- `strategy`
- `allowedArtifactPayloadIds`

**服务端会做：**

- 校验引用的 artifact payload 是否在允许边界内。
- 登记 LLM-authored `WorkoutEditPlan`。

**服务端返回：**

- `editPlanId`
- `targetArtifactId`
- `changes`
- `scope`
- `strategy`
- `requiredCandidateSetIds`

**禁止行为：**

- 不从用户自然语言推导 patch 语义。
- 不修改 artifact。

**重构结论：**

- 保持现状。

### `generateRoutineDraft`

**当前 LLM 需要传：**

- `intent`
- `candidateSetId`
- `candidateExerciseIds`
- `sourceArtifactId`
- `requiredExerciseIds`
- `title`

**当前服务端会做：**

- 校验 `candidateSetId`。
- 根据动作元数据和 `controlledSupplementalCandidates` 自行分配 `warmup` / `training` / `stretch`。
- 缺 section 时自动补动作。
- 自动生成 sets、target、rest、notes。
- 生成完整 `WorkoutRoutineDraft`。

**当前服务端返回：**

- `draftKind="routine"`
- `draftId`
- `candidateSetId`
- `candidateExerciseIds`
- `draft`
- `validation`
- `recovery`

**当前问题：**

- 服务端实际成为 routine 编排器。
- LLM 没有提交完整 routine sections。
- 服务端在决定训练语义。

**目标 LLM 需要传：**

- `intent`
- `candidateSetId`
- `candidateExerciseIds`
- `draft: WorkoutRoutineDraft`
- `sourceArtifactId`
- `requiredExerciseIds`
- `sourceEditPlanId`

**目标服务端会做：**

- 校验 `draft` schema。
- 校验 draft 中所有动作来自 candidate set。
- 校验 required 动作覆盖。
- 校验结构完整、器械 hard constraint、权限和候选 evidence。
- 登记 `draftId`。

**目标服务端返回：**

- `draftKind="routine"`
- `draftId`
- `candidateSetId`
- `candidateExerciseIds`
- `draft`
- `validation`
- `recovery`

**禁止行为：**

- 不根据动作元数据替 LLM 分 section。
- 不自动补动作形成最终编排。
- 不生成 sets、target、rest、notes。

**重构结论：**

- 必须重构。

### `generatePlanDraft`

**当前 LLM 需要传：**

- `intent`
- `candidateSetId`
- `candidateExerciseIds`
- `strategy`
- `sourceArtifact`
- `sourceEditPlanId`

**当前服务端会做：**

- 校验 candidate set。
- 如果没有 source artifact，会用候选动作构造 seed routine。
- 调用 `DomainPlanEngine.expandDomainPlan()` 生成完整 plan draft。

**当前服务端返回：**

- `draftKind="plan"`
- `draftId`
- `candidateSetId`
- `candidateExerciseIds`
- `draft`
- `validation`
- `recovery`

**当前问题：**

- 服务端实际成为长期计划编排器。
- 首次 plan 生成会间接复用服务端 routine 编排。
- `DomainPlanEngine` 还有自然语言正则推断生产入口。

**目标 LLM 需要传：**

- `intent`
- `candidateSetId`
- `candidateExerciseIds`
- `strategy`
- `draft: WorkoutPlanDraft`
- `sourceArtifact`
- `sourceEditPlanId`

**目标服务端会做：**

- 校验 `draft` schema。
- 校验 draft 中所有训练动作来自 candidate set 或合法 source artifact。
- 校验 schedule metadata、周期、周频率、休息日、权限和保存边界。
- 登记 `draftId`。
- 可调用确定性 schedule consistency checker，但不生成语义草稿。

**目标服务端返回：**

- `draftKind="plan"`
- `draftId`
- `candidateSetId`
- `candidateExerciseIds`
- `draft`
- `validation`
- `recovery`

**禁止行为：**

- 不用 `DomainPlanEngine` 自动生成 plan draft。
- 不从用户原文正则推断策略或强度。
- 不用 seed routine 代替 LLM plan draft。

**重构结论：**

- 必须重构。

### `proposeWorkoutPatch`

**LLM 需要传：**

- `editPlan`
- `candidateSetId`
- `candidateExerciseIds`
- `patch`

**服务端会做：**

- 校验 candidate set。
- 校验 `patch` 和 `editPlan` 依赖。
- 登记 LLM-authored `WorkoutPatch`。

**服务端返回：**

- `patchId`
- `candidateSetId`
- `editPlanId`
- `patch`

**禁止行为：**

- 不根据自然语言生成 patch。
- 不保存 patch。

**重构结论：**

- 保持现状；后续可加强 patch target 边界测试。

### `askClarification`

**LLM 需要传：**

- `question`
- `blockingReasons`
- `assistantSuggestions`

**服务端会做：**

- 校验澄清结构。
- 返回澄清结果。

**服务端返回：**

- 同输入结构。

**禁止行为：**

- 不读数据。
- 不写数据。
- 不生成训练。

**重构结论：**

- 保持现状。

### `validateRoutineDraft`

**LLM 需要传：**

- `draftId`
- `candidateSetId`
- `candidateExerciseIds`
- `intent`

**服务端会做：**

- 解析本轮已登记 routine draft。
- 校验 `candidateSetId` 与 draft 绑定一致。
- 调用 Validator 做确定性校验。

**服务端返回：**

- `validationId`
- `valid`
- `errors`
- `warnings`
- `recovery`
- `draftId`
- `candidateSetId`

**禁止行为：**

- 不接收模型重放的大 draft payload。
- 不重新编排 routine。
- 不根据自然语言改变语义字段。

**重构结论：**

- 保持资源引用模式，但适配 LLM-authored draft resource。

### `validatePlanDraft`

**LLM 需要传：**

- `draftId`
- `candidateSetId`
- `candidateExerciseIds`
- `intent`

**服务端会做：**

- 解析本轮已登记 plan draft。
- 校验 candidate set 和 draft 绑定一致。
- 调用 Validator 做确定性校验。

**服务端返回：**

- `validationId`
- `valid`
- `errors`
- `warnings`
- `recovery`
- `draftId`
- `candidateSetId`

**禁止行为：**

- 不重新展开 plan。
- 不调用自然语言推断策略。

**重构结论：**

- 保持资源引用模式，但适配 LLM-authored draft resource。

### `validateWorkoutPatch`

**LLM 需要传：**

- `patchId`
- `candidateSetId`
- `candidateExerciseIds`
- `patch`

**服务端会做：**

- 校验 candidate set。
- 校验 patch 中 replacement exercise 是否来自候选集合。

**服务端返回：**

- `validationId`
- `valid`
- `errors`
- `candidateSetId`
- `patchId`

**禁止行为：**

- 不保存 patch。
- 不生成 replacement。

**重构结论：**

- 保持现状。

### `evaluatePolicy`

**LLM 需要传：**

- `policyTarget`
- 对 `workout_patch`: `patchId`、`patch`
- 对 `new_artifact`: `artifactKind`、`draftId`
- 对 `artifact_revision`: `sourceArtifactId`、`artifactPayloadId`、`draftId` 或 `patchId`

**服务端会做：**

- 调用 PolicyEngine。
- 返回写入是否允许、是否需要确认、阻断原因。

**服务端返回：**

- `policyDecisionId`
- `policy`
- `sourceArtifactId`
- `artifactKind`
- `draftId`
- `patchId`

**禁止行为：**

- 不生成 draft。
- 不保存 artifact。
- 不验证候选边界。

**重构结论：**

- 保持现状。

### `saveConversationArtifactRevision`

**LLM 需要传：**

- `sourceArtifactId`
- `artifactKind`
- `payload`
- `candidateSetId`
- `validationId`
- `policyDecisionId`
- `confirmationId`
- `draftId`
- `patchId`
- `validationPassed=true`
- `policyAllowed=true`
- `responseMessageId`

**服务端会做：**

- 从 `draftId` 或 `patchId` 恢复已登记 payload。
- 校验 validation / policy / confirmation 资源。
- 创建或修订 `ConversationArtifact`。

**服务端返回：**

- `revisionId`
- `artifactId`
- `sourceArtifactId`
- `artifactKind`
- `candidateSetId`
- `validationId`
- `policyDecisionId`
- `draftId`
- `patchId`
- `title`
- `summary`

**禁止行为：**

- 不保存未校验 payload。
- 不从自然语言生成 payload。
- 不绕过 policy。

**重构结论：**

- 保持现状，但确保保存的是 LLM-authored 且已校验的 draft resource。

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
