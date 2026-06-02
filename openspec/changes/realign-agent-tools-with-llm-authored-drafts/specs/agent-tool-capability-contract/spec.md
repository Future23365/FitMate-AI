## ADDED Requirements

### Requirement: Agent Tool 合同必须逐项可审计

系统 SHALL 为每个注册到 `AgentToolRegistry` 的 Agent Tool 保留可人工审计的合同说明。合同说明 MUST 覆盖 Tool 输入、依赖资源、执行内容、返回结果、失败条件和禁止行为。

#### Scenario: 人工审查 Tool 合同
- **WHEN** 开发者打开本 change 的 Tool 合同审计文档
- **THEN** 文档 MUST 列出所有当前 Agent Tools
- **AND** 每个 Tool MUST 说明 LLM 需要传什么
- **AND** 每个 Tool MUST 说明服务端会执行什么
- **AND** 每个 Tool MUST 说明服务端返回什么
- **AND** 每个 Tool MUST 说明该 Tool 不允许执行什么
- **AND** 每个 Tool MUST 说明哪些当前字段需要移除或改名

#### Scenario: 新增 Agent Tool
- **WHEN** 后续新增 Agent Tool
- **THEN** 对应 OpenSpec change MUST 补充该 Tool 的合同说明
- **AND** 实现 MUST 与合同说明一致

### Requirement: 搜索类 Agent Tool 必须保持纯搜索职责

搜索类 Agent Tool SHALL 只按结构化 filters 查询事实库并返回搜索结果资源。搜索类 Tool MUST NOT 接收或返回生成链路用途、覆盖要求、候选集合是否满足、routine / plan section coverage 或后续写入状态。

#### Scenario: `searchExercises` 纯动作搜索
- **WHEN** LLM 调用 `searchExercises`
- **THEN** 输入 MUST 只包含 `query`、`filters`、`limit`、`projection` 等搜索字段
- **AND** 输入 MUST NOT 包含 `candidateUse`、`resultRequirements`、`sectionCoverage` 或 `minCandidates`
- **AND** 输出 MUST 包含 `exerciseSearchResultId` 和动作列表
- **AND** 输出 MUST NOT 包含 `candidateSetStatus`、`satisfied` 或 routine / plan 覆盖状态

#### Scenario: 热身和拉伸搜索默认无器械
- **WHEN** LLM 使用 `searchExercises` 搜索 `allowedSections=["warmup"]` 或 `allowedSections=["stretch"]`
- **AND** 用户没有明确要求器械热身或器械拉伸
- **THEN** Tool MAY 确定性补入 no-equipment 搜索过滤
- **AND** 返回的 `appliedFilters` MUST 标明该默认过滤
- **AND** Tool MUST NOT 因此决定最终 routine section 编排

#### Scenario: `searchArtifacts` 纯 artifact 搜索
- **WHEN** LLM 调用 `searchArtifacts`
- **THEN** 输入 MUST 只包含 `query`、`filters`、`limit`、`projection` 和 scope 字段
- **AND** 输入 MUST NOT 包含 `candidateUse`
- **AND** 输出 MUST 包含 `artifactSearchResultId` 和 artifact 摘要候选
- **AND** Tool MUST NOT 将搜索结果解析成唯一引用

### Requirement: 生成类 Agent Tool 必须登记 LLM-authored draft

生成类 Agent Tool SHALL 接收 LLM 已经产出的结构化业务草稿，并将该草稿登记为本轮可引用资源。生成类 Tool 的目标语义 SHOULD 命名为 `registerRoutineDraft`、`registerPlanDraft`、`registerWorkoutPatch`。生成类 Tool MUST NOT 根据候选动作、动作元数据、用户原文或本地规则自行生成训练语义草稿。

#### Scenario: Routine draft 工具输入
- **WHEN** LLM 调用 `generateRoutineDraft`
- **THEN** 输入 MUST 包含 LLM-authored `WorkoutRoutineDraft` 或等价完整 structured sections
- **AND** 输入 MUST 引用 `exerciseSourceIds`
- **AND** 输入 MAY 引用 `sourceArtifactPayloadId` 或 `sourceEditPlanId`
- **AND** 输入 MUST NOT 只提供 `candidateExerciseIds`

#### Scenario: Plan draft 工具输入
- **WHEN** LLM 调用 `generatePlanDraft`
- **THEN** 输入 MUST 包含 LLM-authored `WorkoutPlanDraft` 或等价完整 structured plan
- **AND** 输入 MUST 引用 `exerciseSourceIds`
- **AND** 输入 MAY 引用 `sourceArtifactPayloadIds` 或 `sourceEditPlanId`
- **AND** 输入 MUST NOT 只提供 `strategy`

#### Scenario: 服务端登记 draft
- **WHEN** 生成类 Tool 收到合法 LLM-authored draft
- **THEN** 服务端 MUST 解析 draft schema
- **AND** 服务端 MUST 校验动作来源边界
- **AND** 服务端 MUST 登记 `draftId`
- **AND** 服务端 MUST NOT 重写 draft 的 section、day、exerciseId 或训练语义

### Requirement: Validation / Policy / Save Tool 必须消费资源引用

Validation、Policy 和保存类 Tool SHALL 通过已登记资源 id 消费 draft、patch、validation 和 policy 结果。它们 MUST NOT 接收模型重放的 raw draft、raw patch、raw payload 或模型自报的校验 / policy 通过状态。

#### Scenario: Draft validation 输入
- **WHEN** LLM 调用 `validateRoutineDraft` 或 `validatePlanDraft`
- **THEN** 输入 MUST 包含 `draftId`
- **AND** 输入 MAY 包含结构化 `requirements` 或 `validationProfile`
- **AND** 输入 MUST NOT 包含 `candidateSetId`、`candidateExerciseIds` 或 `intent`

#### Scenario: Patch validation 输入
- **WHEN** LLM 调用 `validateWorkoutPatch`
- **THEN** 输入 MUST 包含 `patchId`
- **AND** 输入 MUST NOT 包含 raw `patch`

#### Scenario: Policy 输入
- **WHEN** LLM 调用 `evaluatePolicy`
- **THEN** 输入 MUST 包含 `resourceRef` 和 `validationId`
- **AND** Tool MUST 从已登记资源恢复 draft 或 patch
- **AND** Tool MUST NOT 接收 raw draft 或 raw patch

#### Scenario: Save 输入
- **WHEN** LLM 调用 `saveConversationArtifactRevision`
- **THEN** 输入 MUST 包含 `resourceRef`、`validationId` 和 `policyDecisionId`
- **AND** Tool MUST 从已登记资源恢复 payload
- **AND** 输入 MUST NOT 包含 raw `payload`
- **AND** 输入 MUST NOT 包含模型自报的 `validationPassed` 或 `policyAllowed`

### Requirement: Agent Tool 不得读取自然语言补语义

Agent Tool SHALL 只执行输入 schema 中已经表达的结构化参数。Tool MUST NOT 读取 `latestUserMessage`、query 文本、标题、summary 或历史摘要来补齐业务语义。

#### Scenario: Tool 输入缺少业务语义
- **WHEN** LLM 调用 Tool 但没有传入该操作所需结构化字段
- **THEN** Tool MUST 返回结构化失败
- **AND** Tool MUST NOT 从用户原文或历史摘要自行推断该字段

#### Scenario: 需要语义修复
- **WHEN** draft 或 ToolRequest 的业务语义不完整
- **THEN** Agent MUST 让 LLM repair、重新调用候选工具或向用户澄清
- **AND** 服务端 MUST NOT 用本地规则补写语义结果
