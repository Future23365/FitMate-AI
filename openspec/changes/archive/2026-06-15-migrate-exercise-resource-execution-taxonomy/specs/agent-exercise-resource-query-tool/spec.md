## MODIFIED Requirements

### Requirement: `searchExerciseResources` 输入必须只包含动作列表结构化筛选字段

系统 SHALL 将 `searchExerciseResources` 的输入限制为结构化动作列表筛选字段、execution taxonomy 筛选字段和受控候选数量字段。允许字段包括 `exerciseNames`、`category`、`suitabilities`、`level`、`force`、`mechanic`、`requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax`、`noiseLevelMax`、`muscles`、`goalTag`、`riskTag`、`excludeExerciseIds`、`requiredExerciseIds`、`candidateCountPerSection` 和 `sort`。系统 MUST NOT 暴露 `equipment`、`homeRequirement`、`q`、`published`、`visibility`、`bodyRegions`、`intensity`、`userText`、`intent`、`semanticQuery`、`limit`、`page`、`pageSize`、`offset`、`take`、`cursor`、`maxReturned` 或任意 SQL / Prisma 查询片段作为模型可见输入。

#### Scenario: 合法 execution taxonomy 字段
- **WHEN** production registry 序列化 `searchExerciseResources` input schema
- **THEN** schema MUST 包含 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax` 和 `noiseLevelMax`
- **AND** schema MUST 只暴露 `exerciseNames`、`category`、`suitabilities`、`level`、`force`、`mechanic`、`requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax`、`noiseLevelMax`、`muscles`、`goalTag`、`riskTag`、`excludeExerciseIds`、`requiredExerciseIds`、`candidateCountPerSection` 和 `sort`
- **AND** `requiredEquipmentTags` MUST 使用 `ExerciseRequiredEquipmentTag` canonical values
- **AND** `supportRequirementTags` MUST 使用 `ExerciseSupportRequirementTag` canonical values
- **AND** `setupComplexityMax` MUST 使用已知 `ExerciseKnownSetupComplexity` canonical values，不允许 `unknown`
- **AND** `impactLevelMax` MUST 使用 `low`、`medium` 或 `high`
- **AND** `noiseLevelMax` MUST 使用 `quiet`、`normal` 或 `loud`

#### Scenario: 旧字段不再作为模型可见输入
- **WHEN** Planner 传入 `equipment`、`homeRequirement`、`q`、`published`、`visibility`、`bodyRegions`、`intensity`、`userText`、`intent`、`semanticQuery`、`limit`、`page`、`pageSize`、`offset`、`take`、`cursor`、`maxReturned` 或任意 SQL / Prisma 查询片段
- **THEN** `searchExerciseResources` input validation MUST reject 该调用
- **AND** handler MUST NOT 执行动作库查询

#### Scenario: taxonomy 输入自洽
- **WHEN** Planner 同时传入 `requiresExternalEquipment = false` 和非空 `requiredEquipmentTags`
- **THEN** `searchExerciseResources` input validation MUST reject 该调用
- **AND** failure feedback MUST 指出外部器械需求与器械 tag 冲突

#### Scenario: support none 互斥
- **WHEN** Planner 传入 `supportRequirementTags` 且其中包含 `none` 和其他 support tag
- **THEN** `searchExerciseResources` input validation MUST reject 该调用
- **AND** handler MUST NOT 执行动作库查询

### Requirement: `searchExerciseResources` 必须返回查询摘要和动作资源摘要

系统 SHALL 在 `searchExerciseResources` 成功执行后返回动作资源查询摘要和有限动作摘要。模型可见 observation MUST 使用 `candidateGroups[]` 表达当前查询口径下返回的动作候选；每个 candidate group MUST 包含 `suitability` 和 `exercises[]`。每个动作摘要 MUST 至少包含 `exerciseId`、`nameZh`、`nameEn`、主要肌群、图片 URL 和有限 `executionTaxonomy` 事实。旧 `equipmentZh` / `homeRequirementZh` MAY 作为展示摘要保留，但模型 MUST NOT 继续把旧字段当作可填写筛选字段。

#### Scenario: 成功返回 execution taxonomy 摘要
- **WHEN** `searchExerciseResources` 成功查询到动作候选
- **THEN** model observation MUST 包含 `candidateGroups[]`
- **AND** `candidateGroups[].exercises[]` 中每个动作 MUST 包含 `executionTaxonomy`
- **AND** `executionTaxonomy` MUST 只包含 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexity`、`impactLevel` 和 `noiseLevel`
- **AND** model observation MUST NOT 包含完整数据库对象、完整 handler output、内部 service 对象、训练候选 evidence 或与本次查询无关的诊断 payload

### Requirement: `searchExerciseResources` 必须下推数据库查询且不得全表读取

系统 SHALL 为 `searchExerciseResources` 使用专用动作资源查询 repository，在数据库层执行动作名称匹配、结构化数据库 facet、execution taxonomy filters、section-aware hard filter policy、受控候选数量和排除条件筛选，并避免每次 tool 调用读取全量 `Exercise` 数据后再内存过滤。

#### Scenario: Repository 查询下推 execution taxonomy 筛选
- **WHEN** `searchExerciseResources` handler 接收到合法结构化输入
- **THEN** repository MUST 将 `requiresExternalEquipment` 转换为 `Exercise.requiresExternalEquipment` 精确过滤
- **AND** repository MUST 将 `requiredEquipmentTags` 转换为 `Exercise.requiredEquipmentTags hasSome` 过滤
- **AND** repository MUST 将 `supportRequirementTags` 转换为 `Exercise.supportRequirementTags hasSome` 过滤
- **AND** repository MUST 将 `setupComplexityMax` 转换为已知 setup complexity 等级上限过滤，且 `unknown` 不得匹配该过滤
- **AND** repository MUST 将 `impactLevelMax` 转换为 impact level 等级上限过滤，且 `null` 不得匹配该过滤
- **AND** repository MUST 将 `noiseLevelMax` 转换为 noise level 等级上限过滤，且 `null` 不得匹配该过滤
- **AND** repository MUST NOT 使用旧 `equipment` / `homeRequirement` 输入构造 Agent 查询 where 条件
- **AND** repository MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板自动补写 taxonomy 字段

#### Scenario: section hard filter policy 使用 taxonomy 字段
- **WHEN** `searchExerciseResources` 查询 `training`
- **THEN** repository MUST 对 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax` 和 `noiseLevelMax` 应用 hard filters
- **WHEN** `searchExerciseResources` 查询 `warmup` 或 `stretch`
- **THEN** repository MUST 对 section、执行条件 taxonomy、肌群、`exerciseNames`、`requiredExerciseIds` 和 `excludeExerciseIds` 应用 hard filters
- **AND** repository MUST 将 `warmup` 和 `stretch` 查询中传入但未作为 hard filter 使用的非 execution taxonomy 字段记录到 `filterApplications.unappliedInputFilters`

### Requirement: `searchExerciseResources` 投影必须保护模型、用户和 trace 边界

系统 SHALL 为 `searchExerciseResources` 提供安全模型观察、用户投影和 trace summary。模型可见 observation MUST 只表达动作库查询事实、有限动作摘要、execution taxonomy 事实、查询口径和确定性 diagnostics；MUST NOT 暴露业务目标满足度、section coverage 缺口、每个动作的 placement eligibility、最终交付指令、下一步 tool 调用指导或固定 workflow。

#### Scenario: 模型观察只包含安全 taxonomy 事实摘要
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** 模型可见 observation MUST 包含 `candidateGroups[]`
- **AND** 模型可见 observation MUST 在每个 `candidateGroups[].exercises[]` 动作摘要中包含有限 `executionTaxonomy`
- **AND** 模型可见 observation MUST NOT 包含旧 `groups`、每个动作的 `allowedSections`、`sectionSummary`、`availableSections`、`missingSections`、`allowedSectionsRelation`、`groupSemantics`、完整数据库对象、完整 handler output、内部 service 对象、训练候选 evidence 或与本次查询无关的诊断 payload
- **AND** 模型可见 observation MUST NOT 包含 `fulfillment`、`satisfied`、`supportsOutputKinds`、`visibleDeliveryBoundary`、`supportSectionCompletionBoundary`、`routinePlanCompositionBoundary` 或等价字段

### Requirement: `searchExerciseResources` 模型可见说明必须表达业务边界

系统 SHALL 在 tool description、schema description、facet catalog 或 observation 中为模型提供 execution taxonomy 的使用边界。该边界 SHALL 表达 tool 只接受数据库真实 facet、taxonomy canonical values、受控动作 id、受控动作名称和受控候选数量；高层自然语言目标由模型基于 facet catalog、上下文和可见事实自主选择结构化字段。

#### Scenario: Manifest 说明 execution taxonomy 输入来源
- **WHEN** Agent 构造 Planner 可见 tool description 和 schema description
- **THEN** `searchExerciseResources` 的模型可见说明 MUST 表达 `requiresExternalEquipment` 表示动作是否需要外部训练器械
- **AND** 模型可见说明 MUST 表达 `requiredEquipmentTags` 来自 execution taxonomy facet catalog
- **AND** 模型可见说明 MUST 表达 `supportRequirementTags` 表示非训练器械的支撑、场地或搭档条件
- **AND** 模型可见说明 MUST 表达 `setupComplexityMax`、`impactLevelMax` 和 `noiseLevelMax` 是上限筛选，未知或未补齐值不匹配低门槛约束
- **AND** 模型可见说明 MUST NOT 把自然语言短语写成固定 taxonomy 字段选择规则
- **AND** 通用 Agent prompt MUST NOT 新增 `searchExerciseResources` toolName 特例或服务端关键词路由规则

#### Scenario: facet catalog 暴露 taxonomy canonical values
- **WHEN** production registry 注入 `searchExerciseResources` facet catalog
- **THEN** tool description MUST 暴露 execution taxonomy 的 canonical values 摘要
- **AND** tool description MUST NOT 暴露旧 `equipment` 或 `homeRequirements` 作为 Planner 可填写 input facet

### Requirement: `searchExerciseResources` 必须具备 tool-level 验证

系统 SHALL 为 execution taxonomy 查询合同提供直接覆盖真实 tool 执行入口的自动化测试，而不能只验证 registry 或 manifest 暴露。

#### Scenario: Tool 单测覆盖 taxonomy 查询
- **WHEN** 本 change 完成实现
- **THEN** 自动化测试 MUST 直接覆盖 `searchExerciseResources` 的 handler、`executeLangChainToolWrapper` 或当前真实 runtime 执行入口
- **AND** 测试 MUST 覆盖 `requiresExternalEquipment = false`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax` 和 `noiseLevelMax` 的 schema、repository input、model-visible summary、user projection 和 trace summary
- **AND** 测试 MUST 覆盖旧 `equipment` / `homeRequirement` 模型可见 input 被拒绝
- **AND** 测试 MUST 覆盖 `requiredExerciseIds` 与 taxonomy filter mismatch diagnostics
- **AND** 测试 MUST 证明该 tool 仍不产出 `candidateSetId`、`candidate_set` resource、训练卡片或保存事件

#### Scenario: Production catalog 和模型可见门禁覆盖 taxonomy 合同
- **WHEN** production catalog / model-visible contract tests 运行
- **THEN** 测试 MUST 证明 `searchExerciseResources` description 和 schema description 暴露 execution taxonomy 输入来源和 canonical values
- **AND** 测试 MUST 证明 Planner-visible summary 包含有限 `executionTaxonomy`
- **AND** 测试 MUST 证明 Planner-visible summary 仍不暴露 `totalMatches`、`returnedCount`、`truncated`、`candidateCountPerSection`、`filterApplications`、`zeroMatchMuscles` 或固定 workflow 文案
