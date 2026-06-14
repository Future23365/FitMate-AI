## MODIFIED Requirements

### Requirement: `searchExerciseResources` 输入必须只包含动作列表结构化筛选字段
系统 SHALL 将 `searchExerciseResources` 的输入限制为结构化动作列表筛选字段、高层执行条件筛选字段和受控候选数量字段。允许字段包括 `exerciseNames`、`category`、`suitabilities`、`level`、`force`、`mechanic`、`executionProfile`、`equipmentScope`、`impactLimit`、`noiseLimit`、`muscles`、`goalTag`、`riskTag`、`excludeExerciseIds`、`requiredExerciseIds`、`candidateCountPerSection` 和 `sort`。系统 MUST NOT 暴露 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax`、`noiseLevelMax`、`equipment`、`homeRequirement`、`q`、`published`、`visibility`、`bodyRegions`、`intensity`、`userText`、`intent`、`semanticQuery`、`limit`、`page`、`pageSize`、`offset`、`take`、`cursor`、`maxReturned` 或任意 SQL / Prisma 查询片段作为模型可见输入。

#### Scenario: 合法高层执行条件字段
- **WHEN** production registry 序列化 `searchExerciseResources` input schema
- **THEN** schema MUST 包含 `executionProfile`、`equipmentScope`、`impactLimit` 和 `noiseLimit`
- **AND** schema MUST 只暴露 `exerciseNames`、`category`、`suitabilities`、`level`、`force`、`mechanic`、`executionProfile`、`equipmentScope`、`impactLimit`、`noiseLimit`、`muscles`、`goalTag`、`riskTag`、`excludeExerciseIds`、`requiredExerciseIds`、`candidateCountPerSection` 和 `sort`
- **AND** `executionProfile` MUST 只允许 `no_equipment`、`home_support`、`small_equipment`、`gym_equipment`、`partner_required` 或 `outdoor_required`
- **AND** `equipmentScope.mode` MUST 只允许 `compatible_with_available` 或 `must_use_any`
- **AND** `equipmentScope.tags` MUST 使用 `ExerciseRequiredEquipmentTag` canonical values
- **AND** `impactLimit` MUST 使用 `low`、`medium` 或 `high`
- **AND** `noiseLimit` MUST 使用 `quiet`、`normal` 或 `loud`
- **AND** `candidateCountPerSection` MUST 表达每个请求 section 最多返回多少个动作候选
- **AND** `candidateCountPerSection` MUST NOT 被描述为分页、offset、cursor、最终展示数量承诺或全库读取能力

#### Scenario: 底层 taxonomy 字段不再作为模型可见输入
- **WHEN** Planner 传入 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax`、`noiseLevelMax`、`equipment`、`homeRequirement`、`q`、`published`、`visibility`、`bodyRegions`、`intensity`、`userText`、`intent`、`semanticQuery`、`limit`、`page`、`pageSize`、`offset`、`take`、`cursor`、`maxReturned` 或任意 SQL / Prisma 查询片段
- **THEN** `searchExerciseResources` input validation MUST reject 该调用
- **AND** handler MUST NOT 执行动作库查询

#### Scenario: 高层执行条件输入自洽
- **WHEN** Planner 同时传入 `executionProfile = "no_equipment"` 和 `equipmentScope.mode = "must_use_any"`
- **THEN** `searchExerciseResources` input validation MUST reject 该调用
- **AND** failure feedback MUST 指出完整无器械口径不能同时要求动作使用外部器械
- **WHEN** Planner 同时传入 `executionProfile = "home_support"` 和 `equipmentScope.mode = "must_use_any"`
- **THEN** `searchExerciseResources` input validation MUST reject 该调用
- **AND** failure feedback MUST 指出居家无外部器械支撑口径不能同时要求动作使用外部器械

#### Scenario: equipmentScope 输入自洽
- **WHEN** Planner 传入 `equipmentScope.mode = "must_use_any"` 且 `equipmentScope.tags` 为空数组
- **THEN** `searchExerciseResources` input validation MUST reject 该调用
- **AND** handler MUST NOT 执行动作库查询
- **WHEN** Planner 传入 `equipmentScope.mode = "compatible_with_available"` 且 `equipmentScope.tags` 为空数组
- **THEN** input validation MUST allow 该调用
- **AND** repository MUST 将其解释为只允许不需要外部器械的动作

### Requirement: `searchExerciseResources` 必须返回查询摘要和动作资源摘要
系统 SHALL 在 `searchExerciseResources` 成功执行后返回动作资源查询摘要和有限动作摘要。模型可见 observation MUST 使用 `candidateGroups[]` 表达当前查询口径下返回的动作候选；每个 candidate group MUST 包含 `suitability` 和 `exercises[]`。每个动作摘要 MUST 至少包含 `exerciseId`、`nameZh`、`nameEn`、主要肌群、图片 URL 和有限 `executionTaxonomy` 事实。旧 `equipmentZh` / `homeRequirementZh` MAY 作为展示摘要保留，但模型 MUST NOT 继续把旧字段或底层 taxonomy 字段当作可填写筛选字段。

#### Scenario: 成功返回 execution taxonomy 摘要
- **WHEN** `searchExerciseResources` 成功查询到动作候选
- **THEN** model observation MUST 包含 `candidateGroups[]`
- **AND** `candidateGroups[]` 中每个 group MUST 包含 `suitability` 和 `exercises[]`
- **AND** `candidateGroups[].exercises[]` 中每个动作 MUST 包含 `executionTaxonomy`
- **AND** `executionTaxonomy` MUST 只包含 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexity`、`impactLevel` 和 `noiseLevel`
- **AND** model observation MUST NOT 包含完整数据库对象、完整 handler output、内部 service 对象、训练候选 evidence 或与本次查询无关的诊断 payload

#### Scenario: 查询摘要回显高层执行条件
- **WHEN** `searchExerciseResources` 执行成功并返回 query summary
- **THEN** query summary MUST 使用 `executionProfile`、`equipmentScope`、`impactLimit` 和 `noiseLimit` 表达模型请求的执行条件
- **AND** query summary MUST NOT 将 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax` 或 `noiseLevelMax` 暴露为 Planner 可复制 input 字段
- **AND** trace summary MAY 包含服务端内部 taxonomy mapping 诊断
- **AND** trace summary 中的内部 mapping MUST NOT 被投影为模型下一轮可复制 input 示例

#### Scenario: 不向模型暴露 placement 字段
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation 中的每个 `candidateGroups[].exercises[]` 动作摘要 MUST NOT 包含 `allowedSections`
- **AND** model observation MUST NOT 包含 `sectionSummary`、`availableSections`、`missingSections` 或 `allowedSectionsRelation`
- **AND** trace / user projection MAY 保留服务端复盘需要的安全摘要，但不得把这些字段回灌为 Planner 下一轮可复制 input

### Requirement: `searchExerciseResources` 必须下推数据库查询且不得全表读取
系统 SHALL 为 `searchExerciseResources` 使用专用动作资源查询 repository，在数据库层执行动作名称匹配、结构化数据库 facet、高层执行条件到 execution taxonomy filters 的 adapter、section-aware hard filter policy、受控候选数量和排除条件筛选，并避免每次 tool 调用读取全量 `Exercise` 数据后再内存过滤。Repository MUST NOT 使用 `q`、`bodyRegions` 或服务端区域展开构造查询。Repository MUST NOT 从 Planner input 读取 `published`，也 MUST NOT 把 `published` 作为模型可控 hard filter。

#### Scenario: Repository 查询下推 executionProfile 筛选
- **WHEN** `searchExerciseResources` handler 接收到 `executionProfile = "no_equipment"`
- **THEN** repository MUST 匹配 `Exercise.requiresExternalEquipment = false`
- **AND** repository MUST 匹配 `Exercise.requiredEquipmentTags` 为空
- **AND** repository MUST 匹配 `Exercise.setupComplexity IN ("zero_setup", "floor_or_mat")`
- **AND** repository MUST 排除 `supportRequirementTags` 包含 `chair_or_wall`、`gym_fixture`、`partner` 或 `outdoor_space` 的动作
- **WHEN** handler 接收到 `executionProfile = "home_support"`
- **THEN** repository MUST 匹配 `Exercise.requiresExternalEquipment = false`
- **AND** repository MUST 匹配 `Exercise.requiredEquipmentTags` 为空
- **AND** repository MUST 匹配 `Exercise.setupComplexity IN ("zero_setup", "floor_or_mat", "home_support")`
- **AND** repository MUST 排除 `supportRequirementTags` 包含 `gym_fixture`、`partner` 或 `outdoor_space` 的动作
- **WHEN** handler 接收到 `executionProfile = "small_equipment"`
- **THEN** repository MUST 匹配 `Exercise.requiresExternalEquipment = true`
- **AND** repository MUST 匹配 `Exercise.setupComplexity = "small_equipment"`
- **AND** repository MUST 排除 `supportRequirementTags` 包含 `gym_fixture`、`partner` 或 `outdoor_space` 的动作

#### Scenario: Repository 查询下推特殊场地和协助 profile
- **WHEN** `searchExerciseResources` handler 接收到 `executionProfile = "gym_equipment"`
- **THEN** repository MUST 匹配 `Exercise.setupComplexity = "gym_fixture"`、`supportRequirementTags has "gym_fixture"` 或 `requiredEquipmentTags hasSome ["machine", "cable"]` 中至少一个条件
- **WHEN** handler 接收到 `executionProfile = "partner_required"`
- **THEN** repository MUST 匹配 `Exercise.setupComplexity = "partner"` 或 `supportRequirementTags has "partner"` 中至少一个条件
- **WHEN** handler 接收到 `executionProfile = "outdoor_required"`
- **THEN** repository MUST 匹配 `Exercise.setupComplexity = "outdoor"` 或 `supportRequirementTags has "outdoor_space"` 中至少一个条件
- **AND** repository MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板自动选择这些 profile

#### Scenario: Repository 查询下推 equipmentScope 筛选
- **WHEN** `searchExerciseResources` handler 接收到 `equipmentScope.mode = "must_use_any"`
- **THEN** repository MUST 匹配 `Exercise.requiresExternalEquipment = true`
- **AND** repository MUST 将 `equipmentScope.tags` 转换为 `Exercise.requiredEquipmentTags hasSome equipmentScope.tags` 过滤
- **WHEN** handler 接收到 `equipmentScope.mode = "compatible_with_available"`
- **THEN** repository MUST 允许 `Exercise.requiresExternalEquipment = false` 且 `requiredEquipmentTags` 为空的动作
- **AND** repository MUST 允许 `Exercise.requiresExternalEquipment = true` 且 `requiredEquipmentTags` 不包含任何不可用 canonical equipment tag 的动作
- **AND** 不可用 canonical equipment tag MUST 由 `ExerciseRequiredEquipmentTag` 全集减去 `equipmentScope.tags` 得到
- **AND** repository MUST NOT 用 `requiredEquipmentTags hasSome equipmentScope.tags` 替代 `compatible_with_available` 的子集语义

#### Scenario: Repository 查询下推 impactLimit 和 noiseLimit
- **WHEN** `searchExerciseResources` handler 接收到 `impactLimit = "low"`
- **THEN** repository MUST 匹配 `Exercise.impactLevel IN ("low")`
- **WHEN** handler 接收到 `impactLimit = "medium"`
- **THEN** repository MUST 匹配 `Exercise.impactLevel IN ("low", "medium")`
- **WHEN** handler 接收到 `impactLimit = "high"`
- **THEN** repository MUST 匹配 `Exercise.impactLevel IN ("low", "medium", "high")`
- **AND** `Exercise.impactLevel = null` MUST NOT 匹配任何 `impactLimit`
- **WHEN** handler 接收到 `noiseLimit = "quiet"`
- **THEN** repository MUST 匹配 `Exercise.noiseLevel IN ("quiet")`
- **WHEN** handler 接收到 `noiseLimit = "normal"`
- **THEN** repository MUST 匹配 `Exercise.noiseLevel IN ("quiet", "normal")`
- **WHEN** handler 接收到 `noiseLimit = "loud"`
- **THEN** repository MUST 匹配 `Exercise.noiseLevel IN ("quiet", "normal", "loud")`
- **AND** `Exercise.noiseLevel = null` MUST NOT 匹配任何 `noiseLimit`

#### Scenario: section hard filter policy 使用高层执行条件
- **WHEN** `searchExerciseResources` 查询 `training`
- **THEN** repository MUST 对 `executionProfile`、`equipmentScope`、`impactLimit` 和 `noiseLimit` 映射后的 taxonomy where 条件应用 hard filters
- **WHEN** `searchExerciseResources` 查询 `warmup` 或 `stretch`
- **THEN** repository MUST 对 section、执行条件 taxonomy、肌群、`exerciseNames`、`requiredExerciseIds` 和 `excludeExerciseIds` 应用 hard filters
- **AND** repository MUST 将 `warmup` 和 `stretch` 查询中传入但未作为 hard filter 使用的非执行条件字段记录到 `filterApplications.unappliedInputFilters`

### Requirement: `searchExerciseResources` 投影必须保护模型、用户和 trace 边界
系统 SHALL 为 `searchExerciseResources` 提供安全模型观察、用户投影和 trace summary，避免完整 handler output 默认外泄。模型可见 observation MUST 只表达动作库查询事实、有限动作摘要、execution taxonomy 事实、查询口径和确定性 diagnostics；MUST NOT 暴露业务目标满足度、section coverage 缺口、每个动作的 placement eligibility、最终交付指令、下一步 tool 调用指导或固定 workflow。

#### Scenario: 模型观察只包含安全 taxonomy 事实摘要
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** 模型可见 observation MUST 包含 `candidateGroups[]`
- **AND** 模型可见 observation MUST 在每个 `candidateGroups[].exercises[]` 动作摘要中包含有限 `executionTaxonomy`
- **AND** 模型可见 observation MUST NOT 包含旧 `groups`、每个动作的 `allowedSections`、`sectionSummary`、`availableSections`、`missingSections`、`allowedSectionsRelation`、`groupSemantics`、完整数据库对象、完整 handler output、内部 service 对象、训练候选 evidence 或与本次查询无关的诊断 payload
- **AND** 模型可见 observation MUST NOT 包含 `fulfillment`、`satisfied`、`supportsOutputKinds`、`visibleDeliveryBoundary`、`supportSectionCompletionBoundary`、`routinePlanCompositionBoundary` 或等价字段

#### Scenario: 模型投影不泄漏底层输入字段
- **WHEN** `searchExerciseResources` 执行成功并生成模型可见 observation、compressed tool result 或 Planner-visible summary
- **THEN** 模型可见投影 MUST 使用 `executionProfile`、`equipmentScope`、`impactLimit` 和 `noiseLimit` 表达查询口径
- **AND** 模型可见投影 MUST NOT 把 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax` 或 `noiseLevelMax` 表达为可填写 input 字段
- **AND** 模型可见投影 MAY 在动作摘要的 `executionTaxonomy` 中表达数据库事实，但 MUST NOT 将这些事实包装成下一轮 tool input 示例

#### Scenario: 用户投影不生成训练卡片
- **WHEN** Response Renderer 或等价用户投影处理 `searchExerciseResources` 结果
- **THEN** 用户可见投影 MUST 只表达查询口径、命中数量、截断状态和可展示动作摘要
- **AND** 用户可见投影 MUST NOT 生成 `visibleTrainingProposal`、routine、plan、处方、日程或训练卡片事实

### Requirement: `searchExerciseResources` 模型可见说明必须表达业务边界
系统 SHALL 在 tool manifest、schema 描述、examples、facet catalog 或 observation 中为模型提供 `searchExerciseResources` 的使用边界，且不得把该 tool 的业务特例写入通用 Agent prompt。该边界 SHALL 表达 tool 只接受数据库真实 facet、高层执行条件枚举、受控动作 id、受控动作名称和受控候选数量；高层自然语言目标由模型基于 `facetCatalog`、上下文和可见事实自主选择结构化字段。该边界 MUST NOT 表达业务目标满足度，也 MUST NOT 将查询结果包装成结构化训练交付流程或 section placement 建议。

#### Scenario: Manifest 说明高层执行条件输入来源
- **WHEN** Agent 构造 Planner 可见 tool description 和 schema description
- **THEN** `searchExerciseResources` 的模型可见说明 MUST 表达 `executionProfile` 用于选择动作执行场景，合法值为 `no_equipment`、`home_support`、`small_equipment`、`gym_equipment`、`partner_required` 和 `outdoor_required`
- **AND** 模型可见说明 MUST 表达 `no_equipment` 表示完整无器械口径，允许地面或瑜伽垫，但不允许外部训练器械、椅子/墙面、健身房固定设施、搭档或户外空间
- **AND** 模型可见说明 MUST 表达 `home_support` 表示不需要外部训练器械，但允许地面/垫子、椅子、墙面或台阶等常见居家支撑
- **AND** 模型可见说明 MUST 表达 `small_equipment` 表示需要可移动的小型训练器械
- **AND** 模型可见说明 MUST 表达 `gym_equipment`、`partner_required` 和 `outdoor_required` 分别表示需要健身房固定设施/典型健身房器械、搭档辅助和户外空间
- **AND** 模型可见说明 MUST 表达 `impactLimit` 和 `noiseLimit` 是上限筛选，未知或未补齐值不匹配低冲击或安静约束
- **AND** 模型可见说明 MUST NOT 把自然语言短语写成固定 taxonomy 字段选择规则
- **AND** 通用 Agent prompt MUST NOT 新增 `searchExerciseResources` toolName 特例或服务端关键词路由规则

#### Scenario: Manifest 说明 equipmentScope 输入来源
- **WHEN** Agent 构造 Planner 可见 tool description 和 schema description
- **THEN** 模型可见说明 MUST 表达 `equipmentScope.mode = "compatible_with_available"` 用于用户明确说自己可用器械集合时，表示动作不得要求集合外器械
- **AND** 模型可见说明 MUST 表达 `equipmentScope.mode = "must_use_any"` 用于用户明确想找会使用某些器械的动作
- **AND** 模型可见说明 MUST 表达 `equipmentScope.tags` 来自 equipment canonical values
- **AND** 模型可见说明 MUST 表达 `compatible_with_available` 不是 `requiredEquipmentTags hasSome`，而是可用器械上限语义
- **AND** 模型可见说明 MUST NOT 让模型继续填写 `requiredEquipmentTags` 作为 tool input

#### Scenario: 查询结果事实可用于模型自主推理
- **WHEN** `searchExerciseResources` 返回动作列表、空列表或部分候选
- **THEN** 模型可见说明 MUST 表达该结果是当前查询口径下的数据库动作候选事实
- **AND** 模型可见说明 MUST 表达 `candidateGroups[].exercises[]` 中的动作来自对应 `candidateGroups[].suitability` 查询口径
- **AND** 模型可见说明 MUST 表达 `candidateGroups[].suitability` 只表示查询来源，不是最终训练编排命令或动作 placement eligibility
- **AND** 模型可见说明 MUST NOT 表达缺少某 section 时模型必须继续调用 `searchExerciseResources`
- **AND** 模型可见说明 MUST NOT 表达若要交付用户可见结果就必须继续调用 `submitVisibleTrainingProposal`

#### Scenario: facet catalog 暴露高层执行条件 canonical values
- **WHEN** production registry 注入 `searchExerciseResources` facet catalog
- **THEN** tool description MUST 暴露 `executionProfile`、`equipmentScope.tags`、`impactLimit` 和 `noiseLimit` 的 canonical values 摘要
- **AND** tool description MUST NOT 暴露旧 `equipment`、`homeRequirements`、`requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax` 或 `noiseLevelMax` 作为 Planner 可填写 input facet

### Requirement: `searchExerciseResources` 必须具备 tool-level 验证
系统 SHALL 为高层执行条件查询合同提供直接覆盖真实 tool 执行入口的自动化测试，而不能只验证 registry 或 manifest 暴露。

#### Scenario: Tool 单测覆盖高层执行条件查询
- **WHEN** 本 change 完成实现
- **THEN** 自动化测试 MUST 直接覆盖 `searchExerciseResources` 的 handler、`executeTool`、`executeLangChainToolWrapper` 或当前真实 runtime 执行入口
- **AND** 测试 MUST 覆盖 `executionProfile = "no_equipment"`、`executionProfile = "home_support"`、`executionProfile = "small_equipment"`、`executionProfile = "gym_equipment"`、`executionProfile = "partner_required"` 和 `executionProfile = "outdoor_required"` 的 schema、repository input、model-visible summary、user projection 和 trace summary
- **AND** 测试 MUST 覆盖 `equipmentScope.mode = "compatible_with_available"` 的子集语义
- **AND** 测试 MUST 覆盖 `equipmentScope.mode = "must_use_any"` 的 overlap 语义
- **AND** 测试 MUST 覆盖 `impactLimit` 和 `noiseLimit` 的等级上限语义
- **AND** 测试 MUST 覆盖底层 taxonomy 字段和旧 `equipment` / `homeRequirement` 模型可见 input 被拒绝
- **AND** 测试 MUST 覆盖 `requiredExerciseIds` 与高层执行条件 filter mismatch diagnostics
- **AND** 测试 MUST 覆盖 `published` 不再出现在模型可见 input schema、description、examples、query summary 或 `appliedFilters` 中
- **AND** 测试 MUST 覆盖模型传入 `published` 会作为未知字段被 schema 拒绝，且失败反馈包含字段级 issue
- **AND** 测试 MUST 覆盖成功路径、schema 拒绝、空结果、数据库下推查询、projection / redaction、trace summary、handler 失败归一化、`excludeExerciseIds` 去重、数量上限、非法 id 拒绝、数据库层排除、排除后候选不足和摘要投影
- **AND** 测试 MUST 使用接近 AITest 真实动作库查询的健身业务输入
- **AND** 测试 MUST 证明被排除动作不会出现在返回动作中
- **AND** 测试 MUST 证明该 tool 仍不产出 `candidateSetId`、`candidate_set` resource、训练卡片或保存事件

#### Scenario: Production catalog 和模型可见门禁覆盖高层执行条件合同
- **WHEN** production catalog / model-visible contract tests 运行
- **THEN** 测试 MUST 证明 `searchExerciseResources` description 和 schema description 暴露高层执行条件输入来源和 canonical values
- **AND** 测试 MUST 证明 production tool catalog schema 不再暴露 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax` 或 `noiseLevelMax` 作为模型可填写字段
- **AND** 测试 MUST 证明 Planner-visible summary 包含有限 `executionTaxonomy` 动作事实
- **AND** 测试 MUST 证明 Planner-visible summary 仍不暴露 `totalMatches`、`returnedCount`、`truncated`、`candidateCountPerSection`、`filterApplications`、`zeroMatchMuscles` 或固定 workflow 文案
