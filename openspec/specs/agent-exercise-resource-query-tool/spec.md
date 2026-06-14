# agent-exercise-resource-query-tool Specification

## Purpose
TBD - created by archiving change introduce-search-exercise-resources-tool. Update Purpose after archive.
## Requirements
### Requirement: `searchExerciseResources` 必须作为只读动作库事实查询 tool
系统 SHALL 新增 `searchExerciseResources` 业务 Agent tool，用于按结构化筛选条件查询发布态 `Exercise` 数据，并返回可支撑普通文本回答的动作资源摘要。

#### Scenario: 注册低风险只读 tool
- **WHEN** production Agent registry 构造当前可用业务 tools
- **THEN** registry MUST 注册名为 `searchExerciseResources` 的 tool
- **AND** 该 tool MUST 通过 `defineTool` 或等价入口声明 `name`、`version`、`description`、`whenToUse`、`whenNotToUse`、`inputSchema`、`outputSchema`、`policy` 和 `handler`
- **AND** `policy.sideEffect` MUST 为 `read`
- **AND** `policy.riskLevel` MUST 为 `low`
- **AND** `policy.confirmation` MUST 为 `never`

#### Scenario: 查询 tool 不承担训练生成职责
- **WHEN** `searchExerciseResources` 执行成功
- **THEN** 工具结果 MUST NOT 生成 routine、plan、patch、训练卡片、保存事件、artifact 写入或任意 NDJSON 业务事件
- **AND** 工具结果 MUST NOT 包含 `candidateSetId`
- **AND** 工具结果 MUST NOT 产出 `candidate_set` resource

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
- **AND** `candidateCountPerSection` MUST 表达每个请求 section 最多返回多少个动作候选
- **AND** `candidateCountPerSection` MUST NOT 被描述为分页、offset、cursor、最终展示数量承诺或全库读取能力

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
- **AND** `candidateGroups[]` 中每个 group MUST 包含 `suitability` 和 `exercises[]`
- **AND** `candidateGroups[].exercises[]` 中每个动作 MUST 包含 `executionTaxonomy`
- **AND** `executionTaxonomy` MUST 只包含 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexity`、`impactLevel` 和 `noiseLevel`
- **AND** model observation MUST NOT 包含完整数据库对象、完整 handler output、内部 service 对象、训练候选 evidence 或与本次查询无关的诊断 payload

#### Scenario: 不向模型暴露 placement 字段
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation 中的每个 `candidateGroups[].exercises[]` 动作摘要 MUST NOT 包含 `allowedSections`
- **AND** model observation MUST NOT 包含 `sectionSummary`、`availableSections`、`missingSections` 或 `allowedSectionsRelation`
- **AND** trace / user projection MAY 保留服务端复盘需要的安全摘要，但不得把这些字段回灌为 Planner 下一轮可复制 input

### Requirement: `searchExerciseResources` 必须下推数据库查询且不得全表读取
系统 SHALL 为 `searchExerciseResources` 使用专用动作资源查询 repository，在数据库层执行动作名称匹配、结构化数据库 facet、execution taxonomy filters、section-aware hard filter policy、受控候选数量和排除条件筛选，并避免每次 tool 调用读取全量 `Exercise` 数据后再内存过滤。Repository MUST NOT 使用 `q`、`bodyRegions` 或服务端区域展开构造查询。Repository MUST NOT 从 Planner input 读取 `published`，也 MUST NOT 把 `published` 作为模型可控 hard filter。

#### Scenario: Repository 查询下推 execution taxonomy 筛选
- **WHEN** `searchExerciseResources` handler 接收到合法结构化输入
- **THEN** handler MUST 调用专用 repository 查询入口，而不是调用 `listExerciseRecords()`、`listAllExercises()`、旧 `searchExercises()` 或其他全量动作读取入口
- **AND** repository MUST 将 `requiresExternalEquipment` 转换为 `Exercise.requiresExternalEquipment` 精确过滤
- **AND** repository MUST 将 `requiredEquipmentTags` 转换为 `Exercise.requiredEquipmentTags hasSome` 过滤
- **AND** repository MUST 将 `supportRequirementTags` 转换为 `Exercise.supportRequirementTags hasSome` 过滤
- **AND** repository MUST 将 `setupComplexityMax` 转换为已知 setup complexity 等级上限过滤，且 `unknown` 不得匹配该过滤
- **AND** repository MUST 将 `impactLevelMax` 转换为 impact level 等级上限过滤，且 `null` 不得匹配该过滤
- **AND** repository MUST 将 `noiseLevelMax` 转换为 noise level 等级上限过滤，且 `null` 不得匹配该过滤
- **AND** repository MUST NOT 使用旧 `equipment` / `homeRequirement` 输入构造 Agent 查询 where 条件
- **AND** repository MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板自动补写 taxonomy 字段
- **AND** repository MUST 将 `muscle` 与 `muscles` 合并去重后，在 `primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles` 和 `secondaryMusclesZh` 中执行 OR 查询
- **AND** repository MUST NOT 引用 `bodyRegions`、`expandExerciseBodyRegionTargetMuscles` 或等价区域展开逻辑
- **AND** repository MUST 使用同一 section hard filter policy 下的 `where` 执行 `count()` 来生成该 section 的 `totalMatches`
- **AND** repository MUST 使用 `candidateCountPerSection` 或默认候选数量推导的服务端受控 `maxReturned` 执行 `findMany({ take: maxReturned + 1 })` 或等价查询来判断 `truncated`
- **AND** `limit`、`take`、`offset`、`page`、`pageSize`、`cursor` 或 `maxReturned` MUST NOT 由 LLM 输入控制

#### Scenario: section hard filter policy 使用 taxonomy 字段
- **WHEN** `searchExerciseResources` 查询 `training`
- **THEN** repository MUST 对 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax` 和 `noiseLevelMax` 应用 hard filters
- **WHEN** `searchExerciseResources` 查询 `warmup` 或 `stretch`
- **THEN** repository MUST 对 section、执行条件 taxonomy、肌群、`exerciseNames`、`requiredExerciseIds` 和 `excludeExerciseIds` 应用 hard filters
- **AND** repository MUST 将 `warmup` 和 `stretch` 查询中传入但未作为 hard filter 使用的非 execution taxonomy 字段记录到 `filterApplications.unappliedInputFilters`

### Requirement: `searchExerciseResources` 投影必须保护模型、用户和 trace 边界
系统 SHALL 为 `searchExerciseResources` 提供安全模型观察、用户投影和 trace summary，避免完整 handler output 默认外泄。模型可见 observation MUST 只表达动作库查询事实、有限动作摘要、execution taxonomy 事实、查询口径和确定性 diagnostics；MUST NOT 暴露业务目标满足度、section coverage 缺口、每个动作的 placement eligibility、最终交付指令、下一步 tool 调用指导或固定 workflow。

#### Scenario: 模型观察只包含安全 taxonomy 事实摘要
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** 模型可见 observation MUST 包含 `candidateGroups[]`
- **AND** 模型可见 observation MUST 在每个 `candidateGroups[].exercises[]` 动作摘要中包含有限 `executionTaxonomy`
- **AND** 模型可见 observation MUST NOT 包含旧 `groups`、每个动作的 `allowedSections`、`sectionSummary`、`availableSections`、`missingSections`、`allowedSectionsRelation`、`groupSemantics`、完整数据库对象、完整 handler output、内部 service 对象、训练候选 evidence 或与本次查询无关的诊断 payload
- **AND** 模型可见 observation MUST NOT 包含 `fulfillment`、`satisfied`、`supportsOutputKinds`、`visibleDeliveryBoundary`、`supportSectionCompletionBoundary`、`routinePlanCompositionBoundary` 或等价字段

#### Scenario: 用户投影不生成训练卡片
- **WHEN** Response Renderer 或等价用户投影处理 `searchExerciseResources` 结果
- **THEN** 用户可见投影 MUST 只表达查询口径、命中数量、截断状态和可展示动作摘要
- **AND** 用户可见投影 MUST NOT 生成 `visibleTrainingProposal`、routine、plan、处方、日程或训练卡片事实

### Requirement: `searchExerciseResources` 模型可见说明必须表达业务边界
系统 SHALL 在 tool manifest、schema 描述、examples、facet catalog 或 observation 中为模型提供 `searchExerciseResources` 的使用边界，且不得把该 tool 的业务特例写入通用 Agent prompt。该边界 SHALL 表达 tool 只接受数据库真实 facet、execution taxonomy canonical values、受控动作 id、受控动作名称和受控候选数量；高层自然语言目标由模型基于 `facetCatalog`、上下文和可见事实自主选择结构化字段。该边界 MUST NOT 表达业务目标满足度，也 MUST NOT 将查询结果包装成结构化训练交付流程或 section placement 建议。

#### Scenario: Manifest 说明 execution taxonomy 输入来源
- **WHEN** Agent 构造 Planner 可见 tool description 和 schema description
- **THEN** `searchExerciseResources` 的模型可见说明 MUST 表达 `requiresExternalEquipment` 表示动作是否需要外部训练器械
- **AND** 模型可见说明 MUST 表达 `requiredEquipmentTags` 来自 execution taxonomy facet catalog
- **AND** 模型可见说明 MUST 表达 `supportRequirementTags` 表示非训练器械的支撑、场地或搭档条件
- **AND** 模型可见说明 MUST 表达 `setupComplexityMax`、`impactLevelMax` 和 `noiseLevelMax` 是上限筛选，未知或未补齐值不匹配低门槛约束
- **AND** 模型可见说明 MUST 表达 `candidateCountPerSection` 只控制每个请求 section 的候选数量，不是分页、offset、cursor 或最终展示数量承诺
- **AND** 模型可见说明 MUST 表达它不适用于生成训练、保存结果、读取单个动作完整详情、从完整自然语言中做服务端语义解析、替模型做唯一身份强决策、统计全库 facet 或构建 routine / plan / patch 候选集合
- **AND** 模型可见说明 MUST NOT 表达成功结果通过 `satisfied=true`、`fulfillment.satisfied=true` 或等价业务目标满足度支撑普通回答
- **AND** 模型可见说明 MUST NOT 表达 failed、非法输入、0 条结果或候选不足通过 `satisfied=false`、`fulfillment.satisfied=false` 或等价业务目标未满足字段进入下一步
- **AND** 模型可见说明 MUST NOT 表达 `supportsOutputKinds`、`supportsSuccessfulVisibleOutputs`、`finalAnswerSupport` 或等价业务输出可行性判断
- **AND** 模型可见说明 MUST NOT 把自然语言短语写成固定 taxonomy 字段选择规则
- **AND** 通用 Agent prompt MUST NOT 新增 `searchExerciseResources` toolName 特例或服务端关键词路由规则

#### Scenario: 查询结果事实可用于模型自主推理
- **WHEN** `searchExerciseResources` 返回动作列表、空列表或部分候选
- **THEN** 模型可见说明 MUST 表达该结果是当前查询口径下的数据库动作候选事实
- **AND** 模型可见说明 MUST 表达 `candidateGroups[].exercises[]` 中的动作来自对应 `candidateGroups[].suitability` 查询口径
- **AND** 模型可见说明 MUST 表达 `candidateGroups[].suitability` 只表示查询来源，不是最终训练编排命令或动作 placement eligibility
- **AND** 模型可见说明 MUST NOT 表达缺少某 section 时模型必须继续调用 `searchExerciseResources`
- **AND** 模型可见说明 MUST NOT 表达若要交付用户可见结果就必须继续调用 `submitVisibleTrainingProposal`

#### Scenario: facet catalog 暴露 taxonomy canonical values
- **WHEN** production registry 注入 `searchExerciseResources` facet catalog
- **THEN** tool description MUST 暴露 execution taxonomy 的 canonical values 摘要
- **AND** tool description MUST NOT 暴露旧 `equipment` 或 `homeRequirements` 作为 Planner 可填写 input facet

### Requirement: `searchExerciseResources` 必须具备 tool-level 验证
系统 SHALL 为 execution taxonomy 查询合同提供直接覆盖真实 tool 执行入口的自动化测试，而不能只验证 registry 或 manifest 暴露。

#### Scenario: Tool 单测覆盖 taxonomy 查询
- **WHEN** 本 change 完成实现
- **THEN** 自动化测试 MUST 直接覆盖 `searchExerciseResources` 的 handler、`executeTool`、`executeLangChainToolWrapper` 或当前真实 runtime 执行入口
- **AND** 测试 MUST 覆盖 `requiresExternalEquipment = false`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax` 和 `noiseLevelMax` 的 schema、repository input、model-visible summary、user projection 和 trace summary
- **AND** 测试 MUST 覆盖旧 `equipment` / `homeRequirement` 模型可见 input 被拒绝
- **AND** 测试 MUST 覆盖 `requiredExerciseIds` 与 taxonomy filter mismatch diagnostics
- **AND** 测试 MUST 覆盖 `published` 不再出现在模型可见 input schema、description、examples、query summary 或 `appliedFilters` 中
- **AND** 测试 MUST 覆盖模型传入 `published` 会作为未知字段被 schema 拒绝，且失败反馈包含字段级 issue
- **AND** 测试 MUST 覆盖成功路径、schema 拒绝、空结果、数据库下推查询、projection / redaction、trace summary、handler 失败归一化、`excludeExerciseIds` 去重、数量上限、非法 id 拒绝、数据库层排除、排除后候选不足和摘要投影
- **AND** 测试 MUST 使用接近 AITest 真实动作库查询的健身业务输入
- **AND** 测试 MUST 证明被排除动作不会出现在返回动作中
- **AND** 测试 MUST 证明该 tool 仍不产出 `candidateSetId`、`candidate_set` resource、训练卡片或保存事件

#### Scenario: Production catalog 和模型可见门禁覆盖 taxonomy 合同
- **WHEN** production catalog / model-visible contract tests 运行
- **THEN** 测试 MUST 证明 `searchExerciseResources` description 和 schema description 暴露 execution taxonomy 输入来源和 canonical values
- **AND** 测试 MUST 证明 Planner-visible summary 包含有限 `executionTaxonomy`
- **AND** 测试 MUST 证明 Planner-visible summary 仍不暴露 `totalMatches`、`returnedCount`、`truncated`、`candidateCountPerSection`、`filterApplications`、`zeroMatchMuscles` 或固定 workflow 文案

### Requirement: searchExerciseResources 不得承担可见训练方案事实查询职责
`searchExerciseResources` SHALL remain a read-only structured exercise database query tool. It MUST NOT be used as the tool for discovering whether the current conversation already has a user-visible `visibleTrainingProposal`; that responsibility SHALL belong to `inspectVisibleTrainingProposals` `list_recent` / `read_recent` operations.

#### Scenario: Manifest 表达职责边界
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** 模型可见说明 MUST 表达该 tool 只按结构化筛选条件查询发布态动作库
- **AND** 模型可见说明 MUST 表达当前会话是否存在可引用 `visibleTrainingProposal` 应通过 `inspectVisibleTrainingProposals(operation = "list_recent")` 查询
- **AND** 模型可见说明 MUST 表达复用具体上一轮可见训练方案应通过 `inspectVisibleTrainingProposals(operation = "read_recent")` 导入当前 run
- **AND** 模型可见说明 MUST 使用中文描述业务边界，`searchExerciseResources`、`inspectVisibleTrainingProposals`、`operation`、`list_recent`、`read_recent`、`visibleTrainingProposal` 保持英文原样

#### Scenario: search tool 不替代事实 list_recent / read_recent
- **WHEN** 用户请求需要依赖当前会话中是否存在上一轮可见训练方案事实
- **THEN** 模型可见合同 MUST 将 `inspectVisibleTrainingProposals` `list_recent` / `read_recent` results 表达为该事实状态的来源
- **AND** `searchExerciseResources` MUST NOT infer or return current conversation visible proposal references
- **AND** `searchExerciseResources` output MUST NOT contain `factRef`、`messageId`、完整 `visibleTrainingProposal.payload` 或当前会话事实列表

#### Scenario: 明确新动作查询仍可直接 search
- **WHEN** 用户明确提出新的动作查询目标、结构化筛选条件或普通动作事实问题
- **THEN** 模型可见合同 MUST 允许 Planner 直接调用 `searchExerciseResources`
- **AND** 系统 MUST NOT 强制所有动作查询先经过 `inspectVisibleTrainingProposals`
- **AND** 服务端 MUST NOT 根据用户原文关键词阻止合法 `searchExerciseResources` 调用

#### Scenario: 不新增服务端语义分流
- **WHEN** `/api/chat` 处理用户自然语言输入
- **THEN** route、handler、renderer 和 Agent core MUST NOT 根据用户原文选择 `inspectVisibleTrainingProposals` 或 `searchExerciseResources`
- **AND** Planner MUST remain responsible for choosing tools based on visible manifest, context, observations and tool results
- **AND** tests MUST prove no new keyword, regex, synonym table or fixed phrase routing is introduced for refresh-like expressions

### Requirement: `searchExerciseResources` 模型观察必须表达动作事实可组合边界
系统 SHALL 让 `searchExerciseResources` 的模型可见 observation 表达当前 tool result 提供了哪些动作事实、当前查询实际覆盖哪些 section、哪些 section 没有由本次查询返回，以及有哪些确定性 diagnostics。Observation MUST NOT 将 tool result 表达为最终 `visibleTrainingProposal`，也 MUST NOT 指挥模型继续查询、提交结构化收口或按固定顺序补齐 section。

#### Scenario: Observation 表达可用动作事实
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 表达当前结果提供动作库事实
- **AND** model observation MUST 表达当前结果只覆盖实际返回的 section
- **AND** model observation MAY 表达 `groups.<section>.exercises[]` 中的动作是该 section 分组下返回的动作事实
- **AND** model observation MUST NOT 将 tool result 表达为已经生成的最终 `visibleTrainingProposal`

#### Scenario: Observation 表达结构缺口但不替模型选择下一步
- **WHEN** 模型可见 observation 描述 `searchExerciseResources` 的 section 覆盖或缺口
- **THEN** observation MAY 表达 `availableSections` 和 `missingSections`
- **AND** observation MAY 表达 `prescription`、`schedule` 和最终 `payload.kind` 不是该 tool 的输出事实
- **AND** observation MUST NOT 要求模型按照固定调用顺序继续调用 tool
- **AND** observation MUST NOT 要求模型补查 `warmup`、`stretch`、`training` 或其他固定 section
- **AND** observation MUST NOT 要求模型通过结构化收口工具提交当前结果

### Requirement: `searchExerciseResources` examples 必须展示查询能力而非意图分类
系统 SHALL 将 `searchExerciseResources` examples 限定为合法结构化查询输入示例，避免把 examples 变成自然语言意图到输出结构、下一步 tool 或固定 workflow 的映射。

#### Scenario: Examples 只描述 tool 输入
- **WHEN** Agent 序列化 `searchExerciseResources` examples 给 Planner
- **THEN** examples MUST 展示如何填写结构化查询字段，例如 `suitabilities`、`requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`level`、`muscles`、`requiredExerciseIds` 或 `excludeExerciseIds`
- **AND** examples MUST 使用符合当前 schema 的 input
- **AND** examples MUST NOT 说明用户出现某个固定短语时必须选择某个 `visibleTrainingProposal.payload.kind`
- **AND** examples MUST NOT 承诺 tool 自己会生成最终训练方案、处方、日程、结构化收口或保存结果
- **AND** examples MUST NOT 指导模型在查询后必须调用某个具体 tool

### Requirement: `searchExerciseResources` 必须用现有列表结构返回 requiredExerciseIds

系统 SHALL 在不改变 `searchExerciseResources` 输出主结构的前提下支持 `requiredExerciseIds`。指定动作成功纳入时 MUST 出现在现有 `groups.<section>.exercises` 数组中；无法纳入时 MUST 通过现有 `diagnostics` 说明原因。`exerciseNames` 与 `requiredExerciseIds` 均为正向动作锚点，但 `exerciseNames` 表达名称匹配，`requiredExerciseIds` 表达受控数据库 id。

#### Scenario: requiredExerciseIds 纳入现有 exercises 列表
- **WHEN** `searchExerciseResources` 输入包含 `requiredExerciseIds = ["Pushups", "Bodyweight_Squat", "Plank"]`
- **AND** 这些动作存在、发布态可用且适配目标 section
- **THEN** output MUST 继续使用 `groups.<section>.exercises`
- **AND** 对应动作 MUST 出现在该数组中
- **AND** output MUST NOT 新增 `requiredMatches`、`supplementalMatches`、`selectedRequiredExercises` 或等价并行动作列表字段

#### Scenario: requiredExerciseIds 与筛选条件不完全一致
- **WHEN** 某个 required exercise 与 `exerciseNames`、`level`、`requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax`、`noiseLevelMax`、`muscle`、`muscles` 或其他合法筛选字段不完全一致
- **THEN** tool MUST 在 `diagnostics` 中返回稳定 code 和有限说明
- **AND** diagnostics MUST 包含相关 `exerciseId` 和冲突字段摘要
- **AND** tool MUST NOT 通过服务端自然语言判断替模型决定是否放弃该用户点名动作

#### Scenario: requiredExerciseIds 无法纳入
- **WHEN** 某个 required exercise 不存在、未发布、被排除或不能用于目标 section
- **THEN** tool MUST 不把该动作放入 `groups.<section>.exercises`
- **AND** tool MUST 在 `diagnostics` 中返回稳定 code，例如 `required_exercise_not_found`、`required_exercise_unpublished`、`required_exercise_excluded` 或 `required_exercise_section_conflict`
- **AND** 模型 MAY 基于该诊断澄清、放宽条件重查或解释当前无法包含该动作

### Requirement: `searchExerciseResources` 必须具备 requiredExerciseIds 回归验证

系统 SHALL 更新 `searchExerciseResources` 的 tool-level tests、manifest / contract tests 和生产聊天回归，覆盖 required exercise id 与普通列表查询混合使用的场景。

#### Scenario: requiredExerciseIds 测试覆盖多点名动作链路
- **WHEN** 本 change 完成实现
- **THEN** 测试 MUST 覆盖 Planner 已拥有受控 exerciseId 后传入 `searchExerciseResources.requiredExerciseIds`
- **AND** 测试 SHOULD 另行覆盖 `exerciseNames = ["俯卧撑", "深蹲", "平板支撑"]` 的名称查询路径
- **AND** 测试 MUST 证明返回主结构仍为 `groups.<section>.exercises`
- **AND** 测试 MUST 覆盖指定动作缺失、section 冲突、被排除、筛选条件不完全一致和 projection / redaction 边界

### Requirement: searchExerciseResources 模型说明必须支持可见训练方案差异化刷新
`searchExerciseResources` 的模型可见说明 SHALL 表达：当 Planner 已经判断需要替换上一套用户可见 `visibleTrainingProposal` 的动作，并且已经通过当前 run 可见事实获得上一套已展示动作时，可以使用 `excludeExerciseIds` 查询替代动作。该说明 MUST NOT 把任意固定自然语言短语写成强制 tool 调用条件，也 MUST NOT 要求固定 tool 调用顺序。

#### Scenario: Manifest 描述 excludeExerciseIds 在刷新中的边界
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** 模型可见说明 MUST 表达 `excludeExerciseIds` 可用于排除用户已经看到或明确要求排除的动作 id
- **AND** 模型可见说明 MUST 表达可见训练方案刷新时，排除 id 应来自当前 run 可见的已展示动作事实
- **AND** 模型可见说明 MUST 表达未展示给用户的内部候选、trace 摘要、handler-only 结果或未读取完整事实不得默认进入 `excludeExerciseIds`
- **AND** 模型可见说明 MUST 使用中文描述业务含义，`excludeExerciseIds`、`visibleTrainingProposal`、`exerciseItems` 保持英文原样

#### Scenario: Manifest 描述保留约束查询替代动作
- **WHEN** 模型可见说明描述可见训练方案刷新
- **THEN** 说明 MUST 表达 Planner 可在保留原目标、器械、难度、居家条件、section、时长或计划约束的前提下查询替代动作
- **AND** 说明 MUST 表达不同 section 的替代动作仍应来自对应 `groups.<section>.exercises`
- **AND** 说明 MUST 表达最终刷新后的结构必须由合法结构化终态输出和服务端 validator 承载
- **AND** 说明 MUST 表达 `searchExerciseResources` 本身不生成 routine、plan、prescription、schedule 或训练卡片

#### Scenario: 不固定刷新 tool 顺序
- **WHEN** 用户请求可能涉及替换上一套训练方案
- **THEN** 模型可见合同 MUST 允许 Planner 基于上下文自主决定是否先读取事实、直接查询、澄清或失败收口
- **AND** `searchExerciseResources` manifest MUST NOT 表达成用户说某个固定短语时必须调用本 tool
- **AND** `searchExerciseResources` manifest MUST NOT 表达成所有刷新请求都必须先调用指定 tool
- **AND** `/api/chat`、Agent core、renderer 和 tool handler MUST NOT 根据用户原文强制调用 `searchExerciseResources`

#### Scenario: 排除后候选不足
- **WHEN** `searchExerciseResources` 在应用 `excludeExerciseIds` 后返回空结果或候选不足
- **THEN** 模型可见 observation MUST 表达当前条件下可替换候选不足
- **AND** 模型 MAY 基于该结果说明无法完全换新、询问是否放宽条件或复用用户明确要求保留的动作
- **AND** 系统 MUST NOT 为了填满新方案而回填已被排除的用户已看到动作

### Requirement: `searchExerciseResources` 模型观察必须支持 plan 事实补齐决策
系统 SHALL 让 `searchExerciseResources` 的模型可见 observation 表达当前 tool result 已提供哪些 section 的动作事实、哪些 section 仍缺失，以及这些事实如何支撑 `routine` / `plan` 的后续组合。Observation MUST NOT 将 tool result 表达为最终 `visibleTrainingProposal`。

#### Scenario: Observation 表达 plan 组合所需事实缺口
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **AND** 本次结果只包含 `groups.training`
- **THEN** 模型可见 observation MUST 表达当前结果只提供 `training` 动作事实
- **AND** 模型可见 observation MUST 表达如果最终目标是 `routine` 或 `plan`，还需要当前 run 可消费的 `warmup` 和 `stretch` 动作事实
- **AND** 模型可见 observation MUST 表达可用 `suitabilities = ["warmup", "stretch"]` 或等价缺失 section 查询补齐候选
- **AND** 模型可见 observation MUST 表达不得把未返回的 section 伪造成已获得事实
- **AND** 模型可见 observation MUST 表达不得把本次 tool result 直接当作最终 `visibleTrainingProposal`

#### Scenario: Observation 不替模型做服务端语义分流
- **WHEN** `searchExerciseResources` 生成模型可见 observation
- **THEN** observation MUST 只表达事实来源、已返回 section、缺失 section 和可消费边界
- **AND** observation MUST NOT 根据用户原文关键词、正则、同义词表或短句模板替模型选择 `payload.kind`
- **AND** observation MUST NOT 要求所有请求固定调用 `searchExerciseResources`
- **AND** observation MUST NOT 要求普通动作推荐额外查询 `warmup` / `stretch`

### Requirement: `searchExerciseResources` 必须向 Planner 暴露完整可执行 facetCatalog

系统 SHALL 将当前发布态动作库中 `searchExerciseResources` 支持查询的可执行 facet 和 execution taxonomy canonical values 作为模型可见 `facetCatalog` 暴露给 Planner。`facetCatalog` MUST 来自当前数据库事实、同一生产事实源、共享 taxonomy 常量或 tool 合同层稳定查询语义，MUST 去重、过滤空值并使用确定性排序；系统 MUST NOT 用手写自然语言映射表替代数据库事实或 taxonomy 常量，MUST NOT 因集合大小裁剪任何支持查询的 facet 类别。

#### Scenario: facetCatalog 包含全部支持查询的 facet 类别
- **WHEN** production Agent registry 或等价 model input builder 构造 Planner 可见输入
- **THEN** Planner MUST 能看到 `searchExerciseResources.facetCatalog`
- **AND** `facetCatalog` MUST 包含完整 `muscles`
- **AND** `facetCatalog` MUST 包含完整 `categories`
- **AND** `facetCatalog` MUST 包含完整 `levels`
- **AND** `facetCatalog` MUST 包含完整 `forces`
- **AND** `facetCatalog` MUST 包含完整 `mechanics`
- **AND** `facetCatalog` MUST 包含完整 `requiredEquipmentTags`
- **AND** `facetCatalog` MUST 包含完整 `supportRequirementTags`
- **AND** `facetCatalog` MUST 包含完整 `setupComplexity`
- **AND** `facetCatalog` MUST 包含完整 `impactLevel`
- **AND** `facetCatalog` MUST 包含完整 `noiseLevel`
- **AND** `facetCatalog` MUST 包含完整 `goalTags`
- **AND** `facetCatalog` MUST 包含完整 `riskTags`
- **AND** `facetCatalog` MUST 包含完整 `suitabilities`

#### Scenario: execution taxonomy catalog 使用 canonical values
- **WHEN** production Agent registry 或等价 model input builder 构造 execution taxonomy facet catalog
- **THEN** `facetCatalog.requiredEquipmentTags` MUST 来自共享 taxonomy 常量
- **AND** `facetCatalog.supportRequirementTags` MUST 来自共享 taxonomy 常量
- **AND** `facetCatalog.setupComplexity` MUST 暴露已知准备复杂度 canonical values，且不得把 `unknown` 暴露为 `setupComplexityMax` 可填写值
- **AND** `facetCatalog.impactLevel` MUST 暴露 `low`、`medium` 和 `high`
- **AND** `facetCatalog.noiseLevel` MUST 暴露 `quiet`、`normal` 和 `loud`
- **AND** `facetCatalog` MUST NOT 暴露旧 `equipment` 或 `homeRequirements` 作为 Planner 可填写 input facet

#### Scenario: facetCatalog 来自发布态数据库事实
- **WHEN** 数据库发布态 `Exercise` 中新增、删除或修改某个支持查询的 facet 值
- **THEN** 下一次 production registry 或 model input 构造 MUST 使用更新后的 facet 值
- **AND** `facetCatalog` MUST 过滤空值和重复值
- **AND** `facetCatalog` MUST NOT 因 prompt token、集合大小或手写优先级隐藏某个支持查询的 facet 类别
- **AND** `facetCatalog` MAY 包含 `facetCatalogHash`、`source`、`publishedOnly` 或 `generatedAt` 等诊断字段，但这些字段 MUST NOT 替代完整 facet 列表
- **AND** execution taxonomy canonical values 更新时，facet catalog MUST 与共享 taxonomy 常量同步

#### Scenario: facetCatalog 不表达自然语言语义映射
- **WHEN** `facetCatalog` 暴露给 Planner
- **THEN** `facetCatalog` MUST 只表达当前可执行查询值
- **AND** `facetCatalog` MUST NOT 包含“练胸 -> 胸部 / 肩部 / 肱三头肌”或等价自然语言目标映射
- **AND** `facetCatalog` MUST NOT 包含服务端同义词表、关键词规则、短句模板或用户原文解析结果
- **AND** Planner MUST remain responsible for choosing facet values based on user goal, conversation context, tool manifest, observations and tool results

### Requirement: `searchExerciseResources` 必须清理 bodyRegions 的模型可见和执行残留

系统 SHALL 从 `searchExerciseResources` 的执行合同、模型可见合同和测试中删除 `bodyRegions`。删除 MUST 覆盖 schema、manifest、examples、repository、projection、trace、OpenSpec、测试 fixture 和生产聊天回归，避免 Planner 继续看到或输出旧字段。

#### Scenario: Planner 可见输入不再出现 bodyRegions
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** manifest、input schema、examples、schema descriptions 和 tool-specific model input MUST NOT 包含 `bodyRegions`
- **AND** manifest MUST NOT 包含 `upper_body`、`lower_body`、`full_body`、`core` 作为 `searchExerciseResources` 的 input enum
- **AND** manifest MUST NOT 告诉模型使用高层身体区域字段查询动作

#### Scenario: 执行路径不再展开 bodyRegions
- **WHEN** `searchExerciseResources` handler 和 repository 执行查询
- **THEN** 执行路径 MUST NOT 调用 `expandExerciseBodyRegionTargetMuscles`
- **AND** 执行路径 MUST NOT 读取 `exerciseBodyRegionTargetMuscles`
- **AND** 执行路径 MUST NOT 生成 `expandedMuscles`
- **AND** 执行路径 MUST NOT 根据用户原文或区域 enum 补充肌群条件

#### Scenario: 测试覆盖 bodyRegions 删除
- **WHEN** 本 change 完成实现
- **THEN** tool-level test MUST 覆盖传入 `bodyRegions` 会被 schema 拒绝
- **AND** manifest test MUST 断言 Planner 可见 manifest 不含 `bodyRegions`
- **AND** repository test MUST 断言查询 where 只由数据库 facet 字段构造
- **AND** architecture boundary test MUST 断言 `/api/chat`、Agent core、renderer 和 tool handler 没有新增自然语言关键词、正则、同义词表或短句模板分流

### Requirement: `searchExerciseResources` 必须具备 facetCatalog 和 muscles 回归验证

系统 SHALL 为完整 facet catalog、`muscles` 多肌群查询、`bodyRegions` 删除和无服务端语义分流提供自动化测试。

#### Scenario: facetCatalog 测试覆盖全部 facet 类别
- **WHEN** 测试数据库或 repository mock 提供发布态动作，包含肌群、分类、难度、发力类型、动作机制、器械、居家条件、目标标签、风险标签和用途 section
- **THEN** 模型可见 `facetCatalog` MUST 包含这些字段的全部 distinct 值
- **AND** 测试 MUST 证明 `facetCatalog` 使用数据库事实而不是手写常量
- **AND** 测试 MUST 证明空值被过滤、重复值被去重、输出排序确定

#### Scenario: muscles 多肌群查询测试
- **WHEN** `searchExerciseResources` 输入包含 `muscles = ["胸部", "肩部", "肱三头肌"]`
- **THEN** repository MUST 在数据库层对 `primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles` 和 `secondaryMusclesZh` 构造 OR 查询
- **AND** output 的 applied filters 或等价查询摘要 MUST 记录实际使用的 `muscles`
- **AND** handler MUST NOT 额外加入模型未传入的肌群

#### Scenario: 不新增服务端语义分流
- **WHEN** 本 change 完成实现
- **THEN** `/api/chat`、Agent core、renderer、tool handler 和 repository MUST NOT 根据用户原文中的“练胸”“练背”“练腿”“上肢”“下肢”等词选择 facet
- **AND** tests MUST prove no new keyword, regex, synonym table or fixed phrase routing is introduced for `searchExerciseResources`
- **AND** Planner MUST remain responsible for selecting `muscle`、`muscles` and other facet filters from model-visible `facetCatalog`

### Requirement: `searchExerciseResources` 必须区分正向锚点和负向排除
`searchExerciseResources` 的模型可见合同 SHALL 清晰区分 `requiredExerciseIds` 与 `excludeExerciseIds`。`requiredExerciseIds` SHALL 表示受控动作 id 的正向查询锚点；`excludeExerciseIds` SHALL 表示替换、排除或避免重复的负向约束。系统 MUST NOT 将用户已看到或已导入动作默认解释为需要排除。

#### Scenario: requiredExerciseIds 是正向查询锚点
- **WHEN** Planner 已有当前 run 可见且受控的动作 id
- **THEN** Planner MAY 将这些 id 作为 `requiredExerciseIds` 调用 `searchExerciseResources`
- **AND** tool MUST 尝试让这些发布态动作进入对应 `groups.<section>.exercises`
- **AND** model observation MUST 表达这些结果只支撑实际返回的 section

#### Scenario: excludeExerciseIds 是负向约束
- **WHEN** Planner 判断当前目标是替换、排除或避免重复
- **THEN** Planner MAY 将当前 run 可见且用户已看到或明确要求排除的动作 id 作为 `excludeExerciseIds`
- **AND** model-visible schema description MUST 表达 `excludeExerciseIds` 不适用于保留、复用、派生或调整已有动作的目标
- **AND** handler MUST NOT 从历史事实、自然语言摘要或内部候选自动填充 `excludeExerciseIds`

#### Scenario: 已导入动作不默认排除
- **WHEN** 当前 run 已通过 read/import tool 导入上一轮可见训练事实
- **THEN** `searchExerciseResources` manifest MUST NOT 表达导入动作默认应进入 `excludeExerciseIds`
- **AND** observation MUST 表达是否排除由 Planner 基于用户目标和资源操作类型判断
- **AND** `/api/chat` 和 tool handler MUST NOT 根据用户原文替 Planner 填写排除列表

### Requirement: `searchExerciseResources` observation 必须声明不证明已有引用对象
`searchExerciseResources` 的模型可见 observation SHALL 表达该 tool 只提供当前查询返回的动作库事实。Observation MUST NOT 让模型把动作查询结果误认为当前 run 存在可刷新、可替换或可调整的上一轮用户可见对象。

#### Scenario: 动作查询结果不证明存在可操作对象
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 表达本次查询只提供 `groups.<section>.exercises[]` 中的动作事实
- **AND** model observation MUST 表达本次查询不证明当前 run 存在上一套可操作的 `visibleTrainingProposal`
- **AND** model observation MUST 表达本次查询不证明已经完成对已有训练方案的刷新、替换或调整
- **AND** model observation MUST 使用中文描述业务含义，`searchExerciseResources`、`groups`、`visibleTrainingProposal` 等技术标识保持英文原样

#### Scenario: 未应用排除条件时不得宣称刷新成功
- **WHEN** `searchExerciseResources` 的模型可见 observation 表达未应用 `excludeExerciseIds`
- **THEN** observation MUST 表达如果目标是操作已有对象，当前可见引用事实才是对象存在性的依据
- **AND** observation MUST 表达引用对象不可见时，不得使用本次动作查询结果宣称刷新、替换或调整成功
- **AND** observation MUST NOT 要求固定调用 `inspectVisibleTrainingProposals`、固定调用 `read_recent` 或固定输出某个 `payload.kind`

### Requirement: `searchExerciseResources` 必须使用 execution taxonomy 分离器械和执行环境

系统 SHALL 在模型可见合同、执行合同和测试中使用 execution taxonomy 分离外部训练器械、器械 tag、支撑/场地条件、准备复杂度、冲击程度和噪音程度。`requiresExternalEquipment` SHALL 表达是否需要外部训练器械；`requiredEquipmentTags` SHALL 表达需要的训练器械；`supportRequirementTags` SHALL 表达非训练器械的支撑、场地或搭档条件。系统 MUST NOT 继续把旧 `equipment` / `homeRequirement` 作为 Planner 可填写字段，也 MUST NOT 通过旧兼容把错误输入静默转换成新合同。

#### Scenario: 无外部器械查询使用 taxonomy 字段
- **WHEN** `searchExerciseResources` 使用 `requiresExternalEquipment = false` 查询 `suitabilities = ["training"]`
- **AND** 发布态动作库中存在已回填为无外部训练器械、但需要 `floor_or_mat` 或其他支撑条件的 training 动作
- **THEN** 这些动作 MUST 有资格进入数据库查询结果
- **AND** 系统 MUST NOT 因这些动作存在 `supportRequirementTags` 而把它们排除为需要外部训练器械

#### Scenario: 不做旧 equipment / homeRequirement 兼容
- **WHEN** 模型输入 `equipment`、`homeRequirement`、`homeRequirement = "none"` 或 `homeRequirement = "无器械"`
- **THEN** tool handler MUST NOT 将其自动迁移成 `requiresExternalEquipment`、`requiredEquipmentTags` 或 `supportRequirementTags`
- **AND** tool handler MUST NOT 添加 alias、fallback、兼容层或服务端业务分流来修正该输入
- **AND** 该错误输入 MUST 通过 schema、repair 或失败诊断暴露，而不是静默成功

#### Scenario: examples 不展示旧字段组合
- **WHEN** production registry 序列化 `searchExerciseResources` examples
- **THEN** examples MUST NOT 使用 `equipment` 或 `homeRequirement` 表达执行条件查询
- **AND** examples MUST 使用 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax` 或 `noiseLevelMax` 表达执行条件筛选

#### Scenario: 不新增服务端语义分流
- **WHEN** 本 change 完成实现
- **THEN** `/api/chat`、Agent core、renderer、tool handler 和 repository MUST NOT 根据用户原文中的“无器械”“徒手”“自重”“俯卧撑”等词选择 execution taxonomy 字段
- **AND** tests MUST prove no new keyword, regex, synonym table or fixed phrase routing is introduced for `searchExerciseResources`
- **AND** Planner MUST remain responsible for selecting taxonomy filters and other facet filters from model-visible contract

### Requirement: `searchExerciseResources` 必须具备 execution taxonomy 查询合同回归验证

系统 SHALL 为 execution taxonomy 查询、旧 `equipment` / `homeRequirement` 模型可见过滤、不做旧兼容和无服务端语义分流提供自动化测试。

#### Scenario: Tool 单测覆盖无外部器械查询
- **WHEN** tool-level test 使用 `requiresExternalEquipment = false`
- **THEN** 测试 MUST 证明 repository 查询使用 `Exercise.requiresExternalEquipment` 过滤
- **AND** 测试 MUST 证明 repository 查询没有默认加入旧 `equipment` / `homeRequirement` 兼容条件
- **AND** 测试 MUST 使用包含俯卧撑或等价自重地面动作的真实健身场景 fixture

#### Scenario: Manifest 测试覆盖 Planner 可见合同
- **WHEN** manifest / registry test 检查 Planner 可见 `searchExerciseResources`
- **THEN** 测试 MUST 证明 `facetCatalog` 暴露 execution taxonomy canonical values
- **AND** 测试 MUST 证明 Planner 可见 input schema 不再暴露 `equipment` 或 `homeRequirement`
- **AND** 测试 MUST 证明 examples 不再展示旧字段执行条件查询

#### Scenario: 旧兼容缺失是预期行为
- **WHEN** tool-level test 或 schema test 输入 `equipment` 或 `homeRequirement`
- **THEN** 测试 MUST 证明 handler 不会把它迁移成 execution taxonomy 字段
- **AND** 测试 MUST 证明不存在旧字段 alias、fallback 或兼容成功路径

### Requirement: `searchExerciseResources` 模型可见合同必须表达 routine 组合边界
`searchExerciseResources` 的模型可见 manifest、schema description、examples 和 observation SHALL 表达：该 tool 只提供动作事实，并可披露当前结果实际覆盖的 section 与缺口。section 缺口是模型自主规划、澄清或失败收口时可参考的事实，不是固定 tool workflow。该合同 MUST NOT 让 tool 生成最终 `routine`、`plan`、处方、schedule、卡片或保存结果。

#### Scenario: Manifest 表达 section 覆盖事实
- **WHEN** Agent 序列化 `searchExerciseResources` manifest
- **THEN** 模型可见说明 MUST 表达 `groups.<section>.exercises[]` 是当前查询按 section 返回的动作事实
- **AND** 模型可见说明 MAY 表达完整单次训练通常需要 `warmup`、`training`、`stretch` 三类动作事实共同支撑
- **AND** 模型可见说明 MUST NOT 把缺少某 section 写成必须继续调用某个固定 tool、固定查询顺序或固定结构化收口流程
- **AND** 模型可见说明 MUST 使用中文描述业务含义，`searchExerciseResources`、`suitabilities`、`warmup`、`training`、`stretch`、`routine`、`visibleTrainingProposal` 等技术标识保持英文原样

#### Scenario: Observation 区分可补查缺口和候选不足
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **AND** observation 的 `missingSections` 非空
- **THEN** observation MUST 表达当前结果只覆盖实际返回的 section
- **AND** observation MAY 表达缺失 section 对完整 `routine` 或 `plan` 的覆盖风险
- **AND** observation MUST NOT 要求模型按照固定调用顺序继续调用 tool、补查固定 section 或提交结构化收口结果

#### Scenario: Tool 仍不承担最终训练生成职责
- **WHEN** `searchExerciseResources` 执行成功
- **THEN** tool output MUST NOT 生成 `visibleTrainingProposal`、`routine`、`plan`、`prescription`、`schedule`、训练卡片、保存事件或 `candidate_set` resource
- **AND** tool handler MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板决定最终输出结构

### Requirement: searchExerciseResources 必须将无目标 broad query 标记为诊断事实
`searchExerciseResources` SHALL 对缺少可解释筛选条件的 broad query 返回诊断性结果。若 tool input 除默认 `suitabilities`、`sort` 外没有任何目标、facet、器械、场地、点名动作或当前 run 可见动作锚点，模型可见 summary MUST 将该结果标记为 diagnostic 或等价诊断事实等级，该 tool result MUST NOT 支撑成功结构化训练输出。

#### Scenario: 无筛选动作查询不能支撑成功训练输出
- **WHEN** Planner 调用 `searchExerciseResources`，input 只包含默认或等价默认的 `suitabilities`、`sort`
- **THEN** tool execution MAY 返回只读动作摘要
- **AND** model observation MUST 通过 `factLevel`、`querySpecificity` 或等价字段说明该结果只表达查询口径和返回事实
- **AND** model observation MUST 说明不能用该结果输出成功结构化训练结果

#### Scenario: 有结构化约束的动作查询仍可满足
- **WHEN** Planner 调用 `searchExerciseResources`，input 包含 `exerciseNames`、`category`、`level`、`force`、`mechanic`、`requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax`、`noiseLevelMax`、`muscle`、`muscles`、`goalTag`、`riskTag`、`requiredExerciseIds` 或 `excludeExerciseIds` 中至少一类可解释约束
- **THEN** tool result MAY expose `factLevel = "section_scoped_exercise_facts"` 或等价事实等级
- **AND** returned groups MAY be used as current-run action facts subject to final output validation

#### Scenario: Broad query 合同不读取用户原文
- **WHEN** tool 判断 query 是否过宽
- **THEN** 判断 MUST only use structured tool input fields
- **AND** 判断 MUST NOT inspect user original text, keywords, synonyms, regexes or phrasing templates

### Requirement: searchExerciseResources observation 必须表达查询事实和终态输出分离
`searchExerciseResources` 的模型可见 manifest、schema description、examples 和 observation SHALL 表达：该 tool 只查询发布态动作事实，并按 `groups.<section>` 提供 section-scoped 候选；它不生成 `visibleTrainingProposal`、`routine`、`plan`、`prescription`、`schedule`、训练卡片、保存结果或用户记忆。

#### Scenario: 查询结果不等于最终训练结构
- **WHEN** `searchExerciseResources` 返回成功 observation
- **THEN** observation MUST 表达 `groups.<section>.exercises[]` 只是当前查询实际返回的动作事实来源
- **AND** observation MUST 表达最终训练输出必须由合法结构化终态输出和服务端 validator 承载
- **AND** observation MUST NOT 暗示该 tool 已经生成最终 `visibleTrainingProposal`

#### Scenario: 仍缺事实时不能承诺异步继续
- **WHEN** 模型基于 `searchExerciseResources` observation 判断最终结构仍缺 section、动作、处方或 schedule
- **THEN** 模型可见说明 MUST 表达当前 observation 只提供已返回的动作事实和缺口诊断
- **AND** 模型可见说明 MUST 表达不得用成功普通文本承诺本轮之后还会自动继续查询或生成

#### Scenario: 成功普通事实回答应基于成功查询事实
- **WHEN** Planner 使用 `searchExerciseResources` 的结果回答普通动作事实问题
- **THEN** 模型可见说明 MUST 表达普通文本回答只能基于当前成功 tool result summary、用户输入或其他已验证业务事实
- **AND** failed、invalid-input 或诊断性结果 MUST NOT 被包装成成功结构化训练输出

#### Scenario: 不新增服务端动作语义判断
- **WHEN** 实现本 change
- **THEN** `searchExerciseResources` handler MUST NOT 根据用户原文关键词、正则、同义词表、短句模板或具体 phrasing 增删筛选条件
- **AND** `/api/chat` MUST NOT 根据本 tool 的存在新增服务端语义分流

### Requirement: searchExerciseResources 模型可见合同必须表达 section coverage 与结构化输出边界
`searchExerciseResources` 的模型可见 manifest、schema description、examples 和 observation SHALL 表达模型可以通过 `suitabilities` 查询 `warmup`、`training` 或 `stretch` 候选，并在 observation 中通过 `candidateGroups[].suitability` 保留查询来源。模型可见 observation MUST NOT 暴露 section coverage 缺口或每个动作的 placement eligibility。是否需要完整 routine / plan 的 section 结构由模型根据用户目标自主判断，并由最终服务端 validator 复核结构化输出。

#### Scenario: Manifest 表达 section 查询方式
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** manifest MUST 说明 `searchExerciseResources` 可以按 `suitabilities = ["warmup"]`、`["training"]` 或 `["stretch"]` 查询对应用途的动作候选
- **AND** manifest MUST 说明 `suitabilities` 是查询口径，不是最终训练编排命令
- **AND** manifest MUST NOT 说明缺失 section 时必须先调用某个固定 tool、必须补查某个固定 section 或必须提交某个固定终态
- **AND** manifest MUST 使用中文描述业务含义，`searchExerciseResources`、`suitabilities`、`warmup`、`training`、`stretch`、`routine`、`plan`、`visibleTrainingProposal` 保持英文原样

#### Scenario: Observation 不表达 section coverage
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 表达本次查询使用的 `suitabilities`
- **AND** model observation MAY 使用 `candidateGroups[].suitability` 表达每组候选来自哪个查询口径
- **AND** model observation MUST NOT 表达 `availableSections`
- **AND** model observation MUST NOT 表达 `sectionSummary`
- **AND** model observation MUST NOT 表达 `missingSections`
- **AND** model observation MUST NOT 将 section 查询口径表达成固定下一步 tool 调用、固定补查顺序或最终输出禁令全集

### Requirement: searchExerciseResources examples 必须展示 section 查询输入
`searchExerciseResources` 的模型可见 examples SHALL 展示如何按 `suitabilities` 查询 `warmup`、`training` 或 `stretch` section 候选。该 example 只说明动作事实查询输入形态，不得承诺 tool 会生成最终训练结构，也不得把 section 缺口写成固定下一步 workflow。

#### Scenario: Examples 包含 warmup 和 stretch 查询
- **WHEN** production registry 序列化 `searchExerciseResources` manifest 给 Planner
- **THEN** manifest examples MAY 包含使用 `suitabilities = ["warmup", "stretch"]` 查询热身和拉伸候选的合法 input
- **AND** example input SHOULD 包含至少一个可解释的真实 facet、器械、场地或难度约束
- **AND** example description MUST 说明这是 section-scoped 动作事实查询输入示例，不是最终结构生成或固定下一步 tool 指令
- **AND** example description MUST 使用中文描述业务含义，`searchExerciseResources`、`suitabilities`、`warmup`、`stretch`、`routine`、`plan` 保持英文原样

#### Scenario: Tool 说明与输出类型选择指南一致
- **WHEN** `searchExerciseResources` manifest 描述缺 section 场景
- **THEN** manifest MUST 说明当前结果只表达已返回 section 的动作事实
- **AND** manifest MUST 说明普通动作推荐、动作清单或动作事实问答不要求固定查询 `warmup` / `training` / `stretch`
- **AND** manifest MUST NOT 要求所有训练相关请求都固定再次调用 `searchExerciseResources`
- **AND** manifest MUST NOT 把具体用户短句映射成固定 `payload.kind`

#### Scenario: Tool 仍只提供动作事实
- **WHEN** `searchExerciseResources` 执行成功
- **THEN** tool output MUST 仍只提供发布态动作事实查询结果
- **AND** tool output MUST NOT 生成 `visibleTrainingProposal`
- **AND** tool output MUST NOT 生成 `routine`、`plan`、`prescription` 或 `schedule`
- **AND** tool handler MUST NOT 根据用户自然语言、关键词、短句模板或同义词表替模型选择动作或输出结构

### Requirement: `searchExerciseResources` 模型可见说明必须聚焦 tool 独有边界
系统 SHALL 将 `searchExerciseResources` 的 `description`、`whenToUse`、`whenNotToUse`、schema description 和 examples 收敛为动作事实查询 tool 的独有能力说明。模型可见说明 MUST 保留输入字段、facet、section-scoped 动作事实来源和查询结果消费边界；MUST NOT 重复完整通用 terminal final answer 规则。

#### Scenario: manifest 保留动作事实查询边界
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** manifest MUST 表达该 tool 只读查询发布态动作事实
- **AND** manifest MUST 表达它不生成 `visibleTrainingProposal`、`routine`、`plan`、`prescription`、`schedule`、保存结果或用户记忆
- **AND** manifest MUST 表达 `groups.<section>.exercises[]` 是 section-scoped 动作事实来源
- **AND** manifest MUST 表达 `exerciseItems[*].section` 应与使用的 `groups.<section>` 和动作 `allowedSections` 保持一致
- **AND** manifest MUST 保持描述性自然语言为中文，`searchExerciseResources`、`groups`、`section`、`allowedSections`、`visibleTrainingProposal` 等技术标识保持英文原样

#### Scenario: manifest 不重复通用终态长规则
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** manifest MUST NOT 逐段重复 system prompt 中关于普通最终文本不触发后续自动 tool 调用的完整说明
- **AND** manifest MUST NOT 逐段重复 system prompt 中关于 `usedRefs`、resource id、diagnostic result 和 terminal validator 的完整通用规则
- **AND** manifest 可以用短句说明最终训练结构由结构化终态输出和服务端 validator 承载，但不得把该短句扩展成跨 tool 通用终态规则全集

#### Scenario: schema description 保留字段独有含义
- **WHEN** `searchExerciseResources` input schema 被转成 Planner 可见 JSON Schema
- **THEN** `suitabilities` description MUST 保留 `warmup`、`training`、`stretch` 的字段含义
- **AND** `requiresExternalEquipment` description MUST 表达外部训练器械需求边界
- **AND** `requiredEquipmentTags` description MUST 表达训练器械 tag 来自 execution taxonomy canonical values
- **AND** `supportRequirementTags` description MUST 表达非训练器械的支撑、场地或搭档条件
- **AND** `setupComplexityMax`、`impactLevelMax` 和 `noiseLevelMax` description MUST 表达上限筛选且未知值不匹配
- **AND** `requiredExerciseIds` description MUST 表达正向锚点含义
- **AND** `excludeExerciseIds` description MUST 表达负向排除含义
- **AND** schema description MUST NOT 承担 `visibleTrainingProposal` 全局输出选择指南

### Requirement: `searchExerciseResources` examples 必须保留关键输入例子并删除长篇解释
系统 SHALL 为 `searchExerciseResources` 保留少量对模型调用最有帮助的合法 input examples。Examples MUST 展示结构化字段如何填写，而不是解释整套终态输出流程。

#### Scenario: examples 覆盖核心查询形态
- **WHEN** production registry 序列化 `searchExerciseResources` examples
- **THEN** examples MUST 至少覆盖一个受约束动作查询输入
- **AND** examples MAY 覆盖 `warmup` / `stretch` section 的合法查询输入，且不得表达成固定补查 workflow
- **AND** 如保留 `requiredExerciseIds` example，example MUST 使用符合当前 schema 的发布态动作 id 形状
- **AND** examples MUST NOT 包含 `q`、`bodyRegions`、`limit`、`page`、fake `factRef` 或其他非 input schema 字段

#### Scenario: examples 不变成意图分类表
- **WHEN** examples 描述查询输入
- **THEN** examples MUST NOT 表达用户说某个固定短语时必须选择某个 `payload.kind`
- **AND** examples MUST NOT 表达用户说某个固定短语时必须调用某个 tool
- **AND** examples MUST NOT 承诺 `searchExerciseResources` 自己生成 routine、plan、训练卡片、处方或日程

### Requirement: `searchExerciseResources` observation 必须保留动态事实并压缩重复说明
系统 SHALL 在 `searchExerciseResources` 的模型 observation 中继续暴露真实 tool result 才能确定的动态事实。Observation MUST 以结构化字段表达查询事实、动作候选事实、候选数量和 diagnostics；MUST NOT 复制完整 system prompt、manifest 长段、业务输出 kind 判断、section coverage 缺口、动作 placement eligibility、最终目标满足度判断或下一步 action 建议。

#### Scenario: Observation 不暴露输出 kind 判断
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 包含查询事实，例如 `suitabilities`、`returnedCount`、`truncated` 和 `appliedFilters`
- **AND** model observation MUST 包含 `candidateGroups[]` 动作候选事实，每组包含 `suitability` 和 `exercises[]`
- **AND** `candidateGroups[].exercises[]` MUST 包含动作候选事实，例如 `exerciseId`、`nameZh`、`nameEn`、`equipmentZh`、`homeRequirementZh`、`primaryMusclesZh` 和 `imageUrl`
- **AND** model observation MUST NOT 包含 `allowedSections`
- **AND** model observation MUST NOT 包含 `sectionSummary`、`availableSections` 或 `missingSections`
- **AND** model observation MUST NOT 包含 `supportsOutputKinds`
- **AND** model observation MUST NOT 包含 `routinePlanCompositionBoundary.supportsOutputKinds`
- **AND** model observation MUST NOT 包含任何等价字段列出 `exercise_selection`、`routine` 或 `plan` 这类可输出 kind

#### Scenario: Observation 保留必要动态诊断
- **WHEN** 当前查询存在空候选、名称未命中、名称歧义、筛选不匹配、required 动作无法纳入或 zero-match muscles 诊断
- **THEN** model observation MAY 包含对应 `diagnostics[]`
- **AND** diagnostics MUST 只表达当前数据库查询和输入约束事实
- **AND** diagnostics MUST NOT 表达固定下一步 tool 调用、固定补查顺序或最终输出禁令全集

### Requirement: `searchExerciseResources` 必须按 section 应用 hard filter policy
系统 SHALL 让 `searchExerciseResources` 在构造数据库查询前按目标 section 选择 hard filter policy。`training` SHALL 使用严格训练动作 policy；`warmup` 和 `stretch` SHALL 使用 `support_section` policy。该 policy 选择 MUST 只基于 Planner 显式传入并通过 schema 校验的 `suitabilities`，不得基于用户原文、关键词、正则、短句模板、历史摘要、`exerciseNames` 文本或查询结果是否为空。

#### Scenario: training 查询保持严格结构化过滤
- **WHEN** `searchExerciseResources` 输入包含 `suitabilities = ["training"]`
- **AND** 输入包含 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax`、`noiseLevelMax`、`muscles`、`level`、`force`、`mechanic`、`category`、`goalTag`、`riskTag`、`exerciseNames`、`requiredExerciseIds` 或 `excludeExerciseIds`
- **THEN** repository MUST 按 `training` policy 将这些合法结构化字段转换为数据库可执行 hard filters
- **AND** 查询 MUST 继续在数据库层下推
- **AND** 查询 MUST NOT 回到全量动作读取后内存过滤

#### Scenario: warmup 查询使用 support section hard filters
- **WHEN** `searchExerciseResources` 输入包含 `suitabilities = ["warmup"]`
- **AND** 输入包含 `requiresExternalEquipment = false`、`muscles = ["胸部"]` 和 `level = "intermediate"`
- **THEN** repository MUST 按 `support_section` policy 应用发布态、`warmup` section、execution taxonomy 和肌群 hard filters
- **AND** repository MUST NOT 将 `level` 作为该 `warmup` 查询的 hard filter
- **AND** tool output MUST 通过 `filterApplications` 或等价结构声明 `level` 未作为该 section 的 hard filter 使用

#### Scenario: stretch 查询使用 support section hard filters
- **WHEN** `searchExerciseResources` 输入包含 `suitabilities = ["stretch"]`
- **AND** 输入包含 `requiresExternalEquipment`、`supportRequirementTags`、`muscles`、`category`、`goalTag`、`riskTag` 或 `exerciseNames`
- **THEN** repository MUST 按 `support_section` policy 应用发布态、`stretch` section、execution taxonomy 和肌群 hard filters
- **AND** repository MUST 将 `exerciseNames` 作为该 `stretch` 查询的 hard filter
- **AND** repository MUST NOT 将 `category`、`goalTag` 或 `riskTag` 作为该 `stretch` 查询的 hard filters
- **AND** tool output MUST 通过 `filterApplications` 或等价结构声明这些未作为 hard filter 使用的输入字段

#### Scenario: 混合 section 查询分别记录 hardFilterPolicy
- **WHEN** `searchExerciseResources` 输入包含 `suitabilities = ["training", "warmup", "stretch"]`
- **AND** 输入包含 `requiresExternalEquipment`、`muscles` 和 `level`
- **THEN** repository MUST 分别按 section 构造查询
- **AND** `training` 查询 MUST 应用 `level` hard filter
- **AND** `warmup` 与 `stretch` 查询 MUST NOT 应用 `level` hard filter
- **AND** output MUST 分别记录 `training`、`warmup` 和 `stretch` 的 `filterApplications`

#### Scenario: 不新增服务端语义分流
- **WHEN** `/api/chat` 或等价 production entrypoint 收到用户自然语言输入
- **THEN** route、Agent core、handler 和 repository MUST NOT 根据用户原文选择、改写或放宽 `searchExerciseResources` 的 section、器械、肌群、难度、`exerciseNames` 或其他输入字段
- **AND** 系统 MUST NOT 新增关键词、正则、同义词表、短句模板或具体 phrasing 分支来修复 support section 查询

### Requirement: `searchExerciseResources` 必须结构化披露 section 级 filter 执行事实
系统 SHALL 在 `searchExerciseResources` 成功 output 中返回 section 级 filter 执行摘要。该摘要 MUST 使用结构化字段表达 hard filter policy、已应用 hard filters 和未作为 hard filter 使用的输入字段；MUST NOT 使用自由文本 `resultBoundary` 或等价自然语言解释句作为唯一执行边界来源。

#### Scenario: output 包含 filterApplications
- **WHEN** `searchExerciseResources` 使用合法输入完成数据库查询
- **THEN** output MUST 包含 `query.filterApplications` 或等价结构化字段
- **AND** 每个 section 条目 MUST 至少包含 `section`、`hardFilterPolicy`、`appliedHardFilters` 和 `unappliedInputFilters`
- **AND** `hardFilterPolicy` MUST 使用稳定枚举值，例如 `training` 或 `support_section`
- **AND** `hardFilterPolicy` MUST 只表示该 section 的数据库 hard filter 口径，不得表达 Planner 下一步行为策略
- **AND** `appliedHardFilters` MUST 只列出该 section 查询实际作为 hard filter 使用的字段
- **AND** `unappliedInputFilters` MUST 只列出 Planner 已传入但该 section hard filter policy 未作为 hard filter 使用的输入字段

#### Scenario: 未应用输入字段使用稳定 reason code
- **WHEN** Planner 为 `warmup` 或 `stretch` 查询传入 `level`、`force`、`mechanic`、`category`、`goalTag` 或 `riskTag`
- **THEN** `unappliedInputFilters` MUST 为每个未应用字段包含 `field` 和稳定 `code`
- **AND** `code` MUST 使用机器可读枚举，例如 `not_applied_as_hard_filter_for_support_section`
- **AND** output MAY 包含字段值摘要 `valueSummary`
- **AND** `valueSummary` MUST 经过脱敏和截断
- **AND** output MUST NOT 暴露完整数据库对象、完整 handler output、secret 或跨用户 payload

#### Scenario: model observation 投影 filterApplications
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 包含 section 级 `filterApplications` 摘要
- **AND** observation MUST 说明这些字段是 tool 实际执行事实
- **AND** observation MUST NOT 要求 Planner 按固定顺序继续调用 tool
- **AND** observation MUST NOT 判断最终 routine、plan、visibleOutputs 或用户目标是否已经满足
- **AND** observation MUST NOT 将 `hardFilterPolicy` 描述为 Planner 下一步行为策略

#### Scenario: trace summary 可诊断 filter policy
- **WHEN** `searchExerciseResources` 被 production Agent 调用
- **THEN** trace summary MUST 记录每个 section 的 `hardFilterPolicy`、applied hard filter 字段名、未应用输入字段名和 reason code
- **AND** trace summary MUST NOT 记录完整 handler output、完整动作数据库对象、secret 或未经摘要的大 payload

#### Scenario: filterApplications 与数据库 where 使用同一 policy helper
- **WHEN** repository 为某个 section 构造数据库查询
- **THEN** 系统 MUST 使用同一个 section-aware hard filter policy helper 决定该 section 的数据库 where 字段和 `filterApplications` 摘要
- **AND** 系统 MUST NOT 为 where 构造和 `filterApplications` 摘要维护两套可漂移的字段清单
- **AND** 该 helper MUST NOT 读取用户原文、查询结果、trace 或模型自然语言输出

### Requirement: searchExerciseResources observation 必须区分动作事实查询和可见卡片交付
`searchExerciseResources` 的模型可见 manifest、schema description、examples 和 observation SHALL 表达：该 tool 只查询发布态动作事实，并按 `groups.<section>` 提供 section-scoped 动作来源；它不生成 `visibleTrainingProposal`、`routine`、`plan`、`prescription`、`schedule`、训练卡片、保存结果或用户记忆。当模型需要把一组动作作为用户可见、可后续引用的训练结果交付时，MUST 通过结构化收口 tool 提交可被服务端校验的 `visibleTrainingProposal`。

#### Scenario: 动作候选可作为 exercise_selection 的事实来源
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 表达 `groups.<section>.exercises[]` 是模型可见、可被服务端数据库复核的动作事实来源
- **AND** model observation MUST 表达这些动作事实可以用于构造 `visibleTrainingProposal(kind = "exercise_selection")` 的 `exerciseItems[]`
- **AND** model observation MUST 表达 `searchExerciseResources` 本身没有生成最终 `visibleTrainingProposal`
- **AND** model observation MUST 使用中文描述业务含义，`searchExerciseResources`、`groups`、`visibleTrainingProposal`、`exercise_selection`、`exerciseItems` 等技术标识保持英文原样

#### Scenario: 查询成功不等于卡片已生成
- **WHEN** 模型仅调用 `searchExerciseResources` 并获得成功结果
- **THEN** 模型可见说明 MUST 表达该结果只证明动作查询完成并返回动作事实
- **AND** 模型可见说明 MUST 表达最终用户可见训练卡片仍必须由结构化收口 tool accepted 后才能进入 `visible_output`
- **AND** 模型可见说明 MUST NOT 暗示正文列出动作名称可以替代 `visibleTrainingProposal` 结构化交付

#### Scenario: 不新增固定 kind 映射
- **WHEN** 本 change 实现 `searchExerciseResources` 模型可见说明
- **THEN** manifest、schema description、examples 和 observation MUST NOT 根据固定用户短句、关键词、正则、同义词表、具体 phrasing 或单个字段组合规定必须选择 `payload.kind = "exercise_selection"`
- **AND** `/api/chat`、LangChain runtime、tool wrapper、validator 和 response adapter MUST NOT 根据用户原文或 `searchExerciseResources` 字段组合自动生成、改写或补发 `submitVisibleTrainingProposal`

### Requirement: `searchExerciseResources` 多肌群查询必须均衡返回候选
系统 SHALL 让 `searchExerciseResources` 的多 `muscles` 查询返回代表性候选覆盖，而不是只按默认排序取前 N 个。多肌群查询 MUST 在当前 section、当前过滤条件和当前候选数量上限内尽量均衡覆盖请求肌群；没有匹配的肌群只进入诊断事实，不得被解释为必须继续补查或用户目标失败。

#### Scenario: 多肌群 training 查询均衡返回候选
- **WHEN** 模型调用 `searchExerciseResources`，输入包含 `suitabilities = ["training"]`
- **AND** 输入包含多个合法 `muscles`
- **AND** 当前过滤条件下至少两个请求肌群存在匹配候选
- **THEN** 当前查询口径对应的 `candidateGroups[].exercises[]` MUST 尽量包含多个请求肌群的候选动作
- **AND** 系统 MUST NOT 只因默认 `name_asc` 排序而让返回候选集中在单一请求肌群
- **AND** 返回候选 MUST 继续满足 section hard filter、`level`、execution taxonomy、`category`、`goalTag`、`riskTag`、`requiredExerciseIds` 和 `excludeExerciseIds` 等既有筛选合同

#### Scenario: 候选数量受上限约束
- **WHEN** 多肌群查询命中候选数量超过 `candidateCountPerSection` 或默认候选数量
- **THEN** `returnedCount` MUST 不超过该受控候选数量
- **AND** `truncated` MUST 表达是否仍存在未返回候选
- **AND** 模型 MUST NOT 能通过 `limit`、`offset`、`page`、`pageSize`、`take`、`cursor`、`maxReturned` 或等价字段控制返回数量

#### Scenario: requiredExerciseIds 优先于均衡填充
- **WHEN** 输入同时包含多个 `muscles` 和合法 `requiredExerciseIds`
- **THEN** `searchExerciseResources` MUST 继续把 `requiredExerciseIds` 作为正向锚点处理
- **AND** 可纳入当前查询口径的 required 动作 MUST 优先进入对应 `candidateGroups[].exercises[]`
- **AND** 均衡候选选择 MUST 只用于填充剩余名额
- **AND** required 动作无法纳入时 MUST 继续产生既有 required diagnostics

### Requirement: `searchExerciseResources` section group 必须表达 0 命中请求肌群

`searchExerciseResources` SHALL 在每个返回的 `groups.<section>` 中提供 `zeroMatchMuscles` 字段，用于表达该 section 在当前过滤条件下匹配数量为 0 的请求肌群。`zeroMatchMuscles` MUST 是简单字符串数组，MUST 使用与输入 `muscles` 相同的 canonical facet 值。

#### Scenario: 当前过滤条件下某个请求肌群没有候选
- **WHEN** 模型调用 `searchExerciseResources`，输入包含多个合法 `muscles`
- **AND** 某个请求肌群在当前 section、当前其他过滤条件和当前排除条件下独立匹配数量为 0
- **THEN** 对应 `groups.<section>.zeroMatchMuscles` MUST 包含该肌群
- **AND** 该肌群 MUST NOT 出现在 `zeroMatchMuscles` 之外的同义词、自然语言短语或高层身体区域字段中

#### Scenario: 没出现在返回列表不等于 0 命中
- **WHEN** 某个请求肌群在当前过滤条件下存在匹配候选
- **AND** 该肌群没有出现在最终 `groups.<section>.exercises[]` 中
- **THEN** 系统 MUST NOT 将该肌群加入 `zeroMatchMuscles`
- **AND** `zeroMatchMuscles` MUST NOT 从最终返回动作列表倒推生成
- **AND** 系统 MUST 使用独立 count 或等价可验证统计判断该肌群是否为 0 命中

#### Scenario: 没有多肌群输入时字段保持简单
- **WHEN** `searchExerciseResources` 输入没有 `muscles`
- **OR** 输入只包含一个合法肌群
- **THEN** `groups.<section>.zeroMatchMuscles` MUST 返回空数组或在模型可见摘要中省略
- **AND** 系统 MUST NOT 为未请求的肌群生成 0 命中诊断

#### Scenario: zeroMatchMuscles 不表示用户目标失败
- **WHEN** `groups.<section>.zeroMatchMuscles` 包含一个或多个肌群
- **THEN** 模型可见说明 MUST 表达这些值只表示当前 section 和当前过滤条件下没有候选
- **AND** 模型可见说明 MUST NOT 表达数据库永久缺失该肌群
- **AND** 模型可见说明 MUST NOT 表达用户训练目标已经失败
- **AND** 模型可见说明 MUST NOT 要求固定继续调用 `searchExerciseResources` 或任何特定 tool

### Requirement: `searchExerciseResources` 多肌群覆盖增强必须保持既有边界

系统 SHALL 将多肌群均衡返回和 `zeroMatchMuscles` 作为 `searchExerciseResources` 的局部查询事实增强。该增强 MUST 不改变 Agent runtime、provider tool calling、production route、终态训练方案校验或动作保存职责。

#### Scenario: 输出主结构保持兼容
- **WHEN** `searchExerciseResources` 执行成功
- **THEN** output MUST 继续包含 `status`、`query`、`groups` 和 `diagnostics`
- **AND** `query.totalMatches` MUST 继续表示整体 OR 查询命中数量
- **AND** `query.totalMatches` MUST NOT 改为各肌群独立 count 的求和
- **AND** `groups.<section>.exercises[]` MUST 继续只包含有限动作摘要
- **AND** output MUST NOT 新增 `coverageByMuscle`、`missingMuscles`、`uncoveredMuscles` 或其他复杂覆盖报表

#### Scenario: 不新增服务端语义分流
- **WHEN** `/api/chat` 处理用户自然语言输入
- **THEN** route、handler、renderer、LangChain runtime 和 production response adapter MUST NOT 根据用户原文关键词、正则、同义词表、短句模板或固定 phrasing 选择或改写 `searchExerciseResources`
- **AND** Planner MUST 仍基于当前 LangChain tool catalog、上下文、模型可见 observation 和 tool result 自主选择工具

#### Scenario: Tool 仍不生成训练结构
- **WHEN** `searchExerciseResources` 返回均衡后的多肌群候选
- **THEN** 该 tool result MUST NOT 生成 `visibleTrainingProposal`、routine、plan、patch、prescription、schedule、保存结果或 NDJSON 业务事件
- **AND** 结构化训练输出 MUST 继续通过 `submitVisibleTrainingProposal` 或等价终态校验工具提交并由服务端 validator 校验

### Requirement: `searchExerciseResources` 必须支持点名动作名称查询

系统 SHALL 在 `searchExerciseResources` 中支持 `exerciseNames` 输入字段，用于查询模型已经结构化提取出的用户点名动作名称。`exerciseNames` MUST 只按动作名称字段执行确定性匹配，MUST NOT 表示语义搜索、向量召回或服务端自然语言理解。

#### Scenario: exerciseNames 支持多个动作名
- **WHEN** Planner 调用 `searchExerciseResources` 并传入 `exerciseNames = ["俯卧撑", "深蹲", "平板支撑"]`
- **AND** 同时传入 `suitabilities = ["training"]`
- **THEN** tool MUST 按每个名称查询发布态动作候选
- **AND** 成功候选 MUST 合并进入现有 `groups.training.exercises[]`
- **AND** output MUST NOT 新增 `exerciseNameResults`、`resolvedMentions`、`nameMatches` 或等价并行动作列表字段

#### Scenario: exerciseNames 可与结构化筛选组合
- **WHEN** Planner 调用 `searchExerciseResources` 并同时传入 `exerciseNames`、`suitabilities`、`requiresExternalEquipment`、`supportRequirementTags`、`setupComplexityMax`、`level` 或 `muscles`
- **THEN** tool MUST 同时应用名称匹配和合法结构化筛选
- **AND** 不满足筛选条件的名称候选 MUST 不进入 `groups.<section>.exercises[]`
- **AND** tool MUST 通过 `diagnostics` 表达名称存在但与 section 或筛选条件冲突

#### Scenario: exerciseNames 与 muscles 同时存在时按名称分桶
- **WHEN** Planner 调用 `searchExerciseResources` 并同时传入多个 `exerciseNames` 和 `muscles`
- **THEN** repository MUST 以每个 `exerciseNames` 条目作为独立名称查询桶
- **AND** `muscles` MUST 作为每个名称桶内的结构化筛选条件参与查询
- **AND** 单个名称或单个肌群的大量候选 MUST NOT 挤掉其他名称的候选
- **AND** 没有 `exerciseNames` 时，系统 MAY 保留现有多肌群均衡返回策略

#### Scenario: 服务端不抽取 exerciseNames
- **WHEN** `/api/chat`、LangChain runtime、tool wrapper、handler 或 repository 处理用户自然语言输入
- **THEN** 服务端 MUST NOT 根据用户原文、关键词、正则、同义词表、短句模板、历史摘要或 conversationSummary 抽取或补写 `exerciseNames`
- **AND** Planner MUST 继续基于模型可见 context、manifest、observations 和 tool results 自主选择 `exerciseNames`

### Requirement: `searchExerciseResources` 必须废弃宽口径 q 输入

系统 SHALL 从 production 模型可见 `searchExerciseResources` input 合同中移除 `q`。动作名称查询 MUST 使用 `exerciseNames`；肌群、器械、难度、目标、场地和 section 查询 MUST 使用对应结构化字段。

#### Scenario: handler 拒绝 q
- **WHEN** Planner 调用 `searchExerciseResources` 并传入 `q`
- **THEN** input schema MUST 在 handler 执行前拒绝该未知字段
- **AND** failure feedback MUST 表达应使用 `exerciseNames` 或对应结构化筛选字段
- **AND** repository MUST NOT 收到 `q`

#### Scenario: production catalog 不暴露 q
- **WHEN** production registry 序列化 `searchExerciseResources` manifest、schema description、examples 或 model-visible summary
- **THEN** 任一模型可见合同 MUST NOT 暴露 `q`
- **AND** 任一模型可见合同 MUST NOT 暗示该 tool 支持完整自然语言搜索或语义搜索

### Requirement: `searchExerciseResources` 名称查询 diagnostics 必须保持事实化

系统 SHALL 使用现有 `diagnostics` 承载 `exerciseNames` 相关的确定性查询事实。Diagnostics MUST 只表达名称未命中、候选过宽、section 冲突、筛选冲突或候选被排除等事实，MUST NOT 指挥模型下一步必须调用某个 tool、必须澄清或必须生成最终结构。

#### Scenario: 名称未命中进入 diagnostics
- **WHEN** `exerciseNames` 中某个名称没有匹配任何发布态动作
- **THEN** output MUST 不把该名称伪造成动作候选
- **AND** output MUST 在 `diagnostics` 中返回稳定 code，例如 `exercise_name_not_found`
- **AND** diagnostics MUST 包含该名称的有限摘要
- **AND** diagnostics MUST NOT 包含用户完整消息或服务端猜测的替代动作语义

#### Scenario: 名称与 section 或筛选条件冲突
- **WHEN** 某个名称匹配到动作，但动作不能用于目标 section 或不满足合法筛选字段
- **THEN** output MUST 不把该动作放入冲突 section 的 `groups.<section>.exercises[]`
- **AND** output MUST 在 `diagnostics` 中返回稳定 code，例如 `exercise_name_section_conflict` 或 `exercise_name_filter_mismatch`
- **AND** diagnostics MUST 包含冲突字段摘要
- **AND** diagnostics MUST NOT 替模型决定放弃该动作、改用其他动作或继续查询

#### Scenario: 名称候选过宽或歧义进入 diagnostics
- **WHEN** 某个 `exerciseNames` 条目通过包含匹配得到多个候选，或命中数量超过该名称桶的可见候选上限
- **THEN** output MUST 继续使用 `query`、`groups` 和 `diagnostics` 主结构
- **AND** output MAY 返回有限候选到对应 `groups.<section>.exercises[]`
- **AND** output MUST 在 `diagnostics` 中返回稳定 code，例如 `exercise_name_ambiguous` 或 `exercise_name_too_broad`
- **AND** diagnostics MUST 包含该名称的有限摘要、命中数量或截断摘要
- **AND** output MUST NOT 新增 `resolvedMentions`、`nameMatches`、`exerciseNameResults` 或等价并行动作列表字段
- **AND** diagnostics MUST NOT 指挥模型必须澄清、必须重查或必须调用某个固定 tool

### Requirement: `searchExerciseResources` 必须具备名称查询回归验证

系统 SHALL 为 `exerciseNames`、`q` 移除、输出结构稳定和无服务端语义分流提供自动化测试。

#### Scenario: Tool 单测覆盖多名称查询
- **WHEN** tool-level test 调用 `searchExerciseResources` 并传入 `exerciseNames = ["俯卧撑", "深蹲", "平板支撑"]`
- **THEN** 测试 MUST 证明查询结果使用 `groups.<section>.exercises[]`
- **AND** 测试 MUST 证明 output 不包含 `exerciseNameResults`、`resolvedMentions`、`nameMatches` 或等价并行结构
- **AND** 测试 MUST 覆盖成功命中、未命中、section 冲突、筛选冲突、候选过宽、候选歧义、候选去重和 projection / redaction 边界

#### Scenario: q 移除测试覆盖模型可见合同和 schema
- **WHEN** 本 change 完成实现
- **THEN** schema test MUST 证明传入 `q` 会被拒绝
- **AND** manifest / registry test MUST 证明 Planner 可见 `searchExerciseResources` 不包含 `q`
- **AND** examples test MUST 证明 examples 不使用 `q`

#### Scenario: 不新增服务端语义分流测试
- **WHEN** 本 change 完成实现
- **THEN** tests MUST prove no new keyword, regex, synonym table or fixed phrase routing is introduced for `exerciseNames`
- **AND** tests MUST prove `/api/chat`、LangChain runtime、renderer、tool handler 和 repository 不根据用户原文补写动作名称
- **AND** Planner MUST remain responsible for selecting `exerciseNames`

### Requirement: searchExerciseResources 必须支持完整 routine 的 section 事实规划
`searchExerciseResources` 的模型可见说明 SHALL 表达该 tool 可以按 `suitabilities` 查询 `warmup`、`training`、`stretch` 各 section 的动作库事实，并通过 `groups.<section>.exercises[]`、`sectionSummary`、`availableSections` 和 `missingSections` 暴露当前查询覆盖。说明 MUST 支持模型为完整 `routine` 自主规划 section 动作事实，但不得把 section 缺口写成固定继续调用流程。

#### Scenario: manifest 表达 suitabilities section 查询能力
- **WHEN** production registry 序列化 `searchExerciseResources` manifest 或 schema description
- **THEN** 模型可见说明 MUST 表达 `suitabilities` 可使用 `warmup`、`training`、`stretch`
- **AND** 模型可见说明 MUST 表达完整单次训练 `routine` 通常需要分别获得对应 section 的动作事实
- **AND** 模型可见说明 MUST 使用中文描述业务含义，`suitabilities`、`warmup`、`training`、`stretch` 保持英文原样

#### Scenario: 查询覆盖事实不替模型选择下一步
- **WHEN** `searchExerciseResources` observation 暴露 `availableSections` 或 `missingSections`
- **THEN** 模型可见说明 MUST 表达这些字段只描述当前查询口径下的 section 覆盖事实
- **AND** 模型可见说明 MUST NOT 表达缺少 `warmup`、`training` 或 `stretch` 时必须继续调用 `searchExerciseResources`
- **AND** 模型可见说明 MUST NOT 表达查询结果必须通过某个固定业务 tool 收口

### Requirement: `searchExerciseResources` 模型可见说明必须表达多肌群结果的消费边界

`searchExerciseResources` 的模型可见 description、schema description 或 observation SHALL 表达：多 `muscles` 查询用于获得代表性候选覆盖，`zeroMatchMuscles` 是当前 section 和当前过滤条件下的诊断事实，可用于解释、澄清或调整查询，但不是必须继续补查每个肌群的义务。

#### Scenario: 多肌群候选用于代表性覆盖
- **WHEN** production registry 序列化 `searchExerciseResources` manifest、schema description 或等价模型可见说明
- **THEN** 模型可见说明 MUST 表达多 `muscles` 查询用于获得代表性候选覆盖
- **AND** 模型可见说明 MUST NOT 表达 `groups.<section>.exercises[]` 必须覆盖每个请求肌群后才能收口

#### Scenario: zeroMatchMuscles 是诊断事实
- **WHEN** `searchExerciseResources` observation 暴露 `groups.<section>.zeroMatchMuscles`
- **THEN** observation MUST 表达 `zeroMatchMuscles` 可用于解释、澄清或调整查询
- **AND** observation MUST 表达 `zeroMatchMuscles` 不要求固定继续调用 `searchExerciseResources` 或任何特定 tool
- **AND** observation MUST NOT 把 `zeroMatchMuscles` 描述成用户目标失败、动作库永久缺失或最终输出不可收口

### Requirement: execution taxonomy 模型可见说明必须表达输入来源边界

`searchExerciseResources` 的 execution taxonomy schema description 或 tool description SHALL 表达这些字段只在用户目标、上下文、已验证事实或当前规划确实需要执行条件约束时填写。省略 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax` 或 `noiseLevelMax` SHALL 表示不额外限定对应执行条件。

#### Scenario: supportRequirementTags 只表达支撑场地约束
- **WHEN** production registry 序列化 `searchExerciseResources` input schema
- **THEN** `supportRequirementTags` 的模型可见说明 MUST 表达它只表示非训练器械的支撑、场地或搭档条件
- **AND** 说明 MUST 表达无外部器械约束应使用 `requiresExternalEquipment = false`
- **AND** 说明 MUST 表达省略 `supportRequirementTags` 表示不额外限定支撑、场地或搭档条件

#### Scenario: execution taxonomy 不承接保守默认
- **WHEN** 用户目标缺少环境、场地或支撑条件偏好
- **THEN** 模型可见说明 MUST 允许 Planner 不填写 `supportRequirementTags`
- **AND** `/api/chat`、LangChain runtime、tool wrapper、handler 和 repository MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板自动补写 `requiresExternalEquipment`、`requiredEquipmentTags` 或 `supportRequirementTags`

### Requirement: `searchExerciseResources` 必须支持受控候选数量输入
系统 SHALL 允许 `searchExerciseResources` 通过 `candidateCountPerSection` 表达每个请求 section 的候选返回数量。该字段 MUST 是受控整数，省略时使用集中配置默认值 8，最大值 MUST 为集中配置上限 24。该字段 MUST NOT 提供分页、offset、cursor、任意全库读取或 output-only `maxReturned` 复制能力。

#### Scenario: 模型请求 10 个 training 候选
- **WHEN** Planner 调用 `searchExerciseResources` 并传入 `suitabilities = ["training"]`
- **AND** 输入包含 `candidateCountPerSection = 10`
- **THEN** handler MUST 将该值作为当前 section 的候选上限传给动作资源 repository
- **AND** model observation 的 `returnedCount` MUST 不超过 10
- **AND** model observation MUST NOT 暴露 `maxReturned`、`limit`、`page`、`pageSize`、`offset`、`take` 或 `cursor`

#### Scenario: 候选数量超过上限
- **WHEN** Planner 调用 `searchExerciseResources` 并传入 `candidateCountPerSection > 24`
- **THEN** tool input validation MUST reject 该输入
- **AND** handler MUST NOT 执行动作库查询

#### Scenario: 未传候选数量
- **WHEN** Planner 调用 `searchExerciseResources` 且未传入 `candidateCountPerSection`
- **THEN** handler MUST 使用集中配置默认值 8 作为每个请求 section 的候选上限

### Requirement: `searchExerciseResources` 模型可见 summary 必须只暴露候选事实和中性诊断

系统 SHALL 将 `searchExerciseResources` 的 Planner-visible summary 限定为当前查询口径、有限动作候选事实和中性诊断。Planner-visible summary MUST NOT 暴露精确命中数、返回数量、截断状态、候选预算回显、排序、过滤执行细节、section coverage、placement eligibility、边界说明或任何会暗示必须继续查询的字段。内部 handler output、trace summary 和 user projection MAY 保留这些调试统计。

#### Scenario: 成功候选结果不暴露继续查询诱导字段
- **WHEN** `searchExerciseResources` 成功返回动作候选
- **AND** 内部结果、trace summary 或 user projection 包含 `totalMatches`、`returnedCount`、`truncated`、`excludedCount`、`candidateCountPerSection`、`sort`、`appliedFilters`、`filterApplications` 或等价执行诊断
- **THEN** Planner-visible summary MUST 包含 `status`、`factLevel`、必要的查询语义过滤值和 `candidateGroups[]`
- **AND** Planner-visible summary MUST 包含 `candidateGroups[].suitability`
- **AND** Planner-visible summary MUST 包含 `candidateGroups[].exercises[]` 中的有限动作事实，例如 `exerciseId`、`nameZh`、`nameEn`、`equipmentZh`、`homeRequirementZh`、`primaryMusclesZh`、`secondaryMusclesZh` 和 `imageUrl`
- **AND** Planner-visible summary MUST NOT 包含 `totalMatches`、`returnedCount`、`truncated`、`excludedCount`、`candidateCountPerSection`、`sort`、`maxReturned`、`limit`、`take`、`offset`、`page`、`pageSize` 或 `cursor`
- **AND** Planner-visible summary MUST NOT 包含 `querySpecificity`、`filterSemantics`、`appliedFilters`、`filterApplicationBoundary`、`filterApplications`、`positiveAnchorBoundary` 或 `refreshExclusionBoundary`
- **AND** Planner-visible summary MUST NOT 包含 `sectionSummary`、`availableSections`、`missingSections`、`allowedSectionsRelation`、`groupSemantics`、`allowedSections` 或等价 placement 字段
- **AND** Planner-visible summary MUST NOT 包含 `candidateGroups[].totalMatches`、`candidateGroups[].returnedCount`、`candidateGroups[].truncated` 或 `candidateGroups[].zeroMatchMuscles`

#### Scenario: 空候选或冲突诊断不暴露精确计数
- **WHEN** `searchExerciseResources` 的合法查询没有返回可用候选、点名动作无法纳入或输入约束冲突
- **THEN** Planner-visible summary MAY 包含中性 `diagnostics[]`
- **AND** `diagnostics[]` MUST 只表达当前查询无法提供候选、需要澄清、需要放宽条件或存在确定性冲突
- **AND** `diagnostics[]` MUST NOT 包含 `totalMatches`、`returnedCount`、`truncated`、`candidateCountPerSection` 或等价精确统计
- **AND** `diagnostics[]` MUST NOT 包含 `exercise_name_too_broad`、`too_broad` 或其他会表达“继续扩大查询即可解决”的 code
- **AND** `diagnostics[]` MUST NOT 包含 `sufficient`、`insufficient`、`ready`、`canProceed`、`canDeliverPlan`、`goalSatisfied`、`businessGoalSatisfied`、`complete` 或等价 sufficiency / readiness / completion 字段或文案
- **AND** 内部 trace MAY 继续保留原始失败 code 和统计，用于开发排障

#### Scenario: 模型可见 summary 不提供固定下一步建议
- **WHEN** `searchExerciseResources` 的 Planner-visible summary 进入下一轮模型输入
- **THEN** summary MUST NOT 表达“必须继续调用 `searchExerciseResources`”、“必须扩大 `candidateCountPerSection`”、“必须补查某个 section”或等价固定 workflow
- **AND** summary MUST NOT 表达“候选已经足够”、“候选还不够”、“已经 ready”、“可以生成训练方案”或等价业务目标满足度判断
- **AND** summary MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板替 Planner 选择下一步 tool
- **AND** summary MUST NOT 将查询结果表达成已完成的 `visibleTrainingProposal`、routine、plan、prescription、schedule 或保存结果

#### Scenario: 调试统计保留在非 Planner 通道
- **WHEN** Response Renderer、trace exporter 或开发调试面板消费 `searchExerciseResources` 结果
- **THEN** 系统 MAY 保留 `totalMatches`、`returnedCount`、`truncated`、`candidateCountPerSection`、`filterApplications`、`diagnostics[].totalMatches` 和等价统计
- **AND** 这些字段 MUST NOT 被回灌到 Planner-visible summary
- **AND** 服务端 validator MUST 继续基于真实 tool result、数据库事实和结构化输出合同校验最终结果

### Requirement: `searchExerciseResources` 模型可见说明必须区分候选数量 input 与执行统计 output

系统 SHALL 在 `searchExerciseResources` 的 manifest、schema description、examples 和 Planner-visible summary 中区分 `candidateCountPerSection` 作为受控 input 的含义与执行后的统计 output。Planner 可以传入 `candidateCountPerSection` 控制候选上限，但成功 result 的 Planner-visible summary MUST NOT 回显该字段或用 `returnedCount` / `truncated` 暗示继续扩大查询。

#### Scenario: 输入 schema 仍允许受控候选数量
- **WHEN** production registry 序列化 `searchExerciseResources` input schema
- **THEN** schema MAY 包含 `candidateCountPerSection`
- **AND** `candidateCountPerSection` MUST 被描述为每个请求 section 的受控候选数量上限
- **AND** `candidateCountPerSection` MUST NOT 被描述为分页、offset、cursor、全库读取能力或最终展示数量承诺

#### Scenario: 成功结果不回显候选预算
- **WHEN** `searchExerciseResources` 使用 `candidateCountPerSection` 执行成功
- **THEN** Planner-visible summary MUST NOT 回显 `candidateCountPerSection`
- **AND** Planner-visible summary MUST NOT 使用 `returnedCount`、`truncated`、`totalMatches` 或等价字段提示模型继续扩大候选数量
- **AND** trace summary MAY 记录实际使用的 `candidateCountPerSection`、命中数量和截断状态
