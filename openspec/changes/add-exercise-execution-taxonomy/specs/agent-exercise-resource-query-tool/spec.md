## MODIFIED Requirements

### Requirement: `searchExerciseResources` 输入必须只包含动作列表结构化筛选字段

系统 SHALL 使用严格 input schema 约束 `searchExerciseResources` 入参，字段范围必须对齐当前 `Exercise` 数据库可确定性执行的筛选字段和 tool 合同层定义的稳定查询语义。系统 MUST 删除 `q`，不得再暴露宽口径自然语言查询字段。系统 MUST 新增 `exerciseNames`，用于表达模型已经结构化提取出的点名动作名称数组。系统 MUST 删除 `bodyRegions`，不得再使用高层身体区域 enum 或服务端区域展开替代模型对真实数据库 facet 的选择。系统 MUST NOT 将 `published` 暴露为模型可传 input；动作可用性边界属于服务端数据库事实或下游 validator，不由 Planner 控制。系统 MUST NOT 将旧 `equipment` 和 `homeRequirement` 暴露为模型可传 input；动作执行条件 MUST 使用新的 execution taxonomy 字段表达。刷新场景 MAY 通过 `excludeExerciseIds` 排除指定动作 id；点名动作已经拥有受控数据库 id 后，MAY 通过 `requiredExerciseIds` 请求返回列表优先包含这些动作。肌群筛选 MUST 使用统一 `muscles` 数组字段表达，一个肌群也写成单项数组。

#### Scenario: exerciseNames 表达点名动作名称
- **WHEN** production registry 序列化 `searchExerciseResources` manifest、schema description 或 examples
- **THEN** 模型可见输入合同 MUST 包含 `exerciseNames`
- **AND** `exerciseNames` MUST 被描述为模型已经结构化提取出的动作名称数组
- **AND** 模型可见说明 MUST 表达 `exerciseNames` 只用于动作名称字段的确定性匹配
- **AND** 模型可见说明 MUST NOT 把 `exerciseNames` 描述为语义搜索、向量搜索、肌群推断、标签推断或完整自然语言搜索字段
- **AND** examples MUST NOT 将完整用户消息放入 `exerciseNames`

#### Scenario: q 不再出现在模型可见输入合同
- **WHEN** production registry 序列化 `searchExerciseResources` manifest、input schema、schema description 或 examples
- **THEN** 模型可见输入合同 MUST NOT 包含 `q`
- **AND** examples MUST NOT 包含 `q`
- **AND** 模型可见说明 MUST 表达动作名称查询应使用 `exerciseNames`
- **AND** 模型可见说明 MUST 表达肌群、器械可用性、执行支撑条件、难度、目标、风险和 section 查询应使用对应结构化字段

#### Scenario: 旧 equipment 和 homeRequirement 不再出现在模型可见输入合同
- **WHEN** production registry 序列化 `searchExerciseResources` manifest、input schema、schema description 或 examples
- **THEN** 模型可见输入合同 MUST NOT 包含 `equipment`
- **AND** 模型可见输入合同 MUST NOT 包含 `homeRequirement`
- **AND** examples MUST NOT 包含 `equipment`
- **AND** examples MUST NOT 包含 `homeRequirement`
- **AND** 模型可见说明 MUST NOT 把 `equipment = "no_equipment"`、`homeRequirement = "none"`、`homeRequirementZh = "无器械"` 或等价旧字段写法展示为推荐 tool input
- **AND** 用户可见自然语言 MAY 继续使用“无器械”“地面/瑜伽垫”“家里做”等描述训练条件
- **AND** 服务端 MUST NOT 根据用户原文新增关键词、正则、同义词表或短句模板来改写执行条件字段

#### Scenario: 新 execution taxonomy 表达执行条件
- **WHEN** production registry 序列化 `searchExerciseResources` manifest、input schema、schema description 或 examples
- **THEN** 模型可见输入合同 MUST 包含用于表达无外部训练器械的受控字段，例如 `equipmentAvailability`
- **AND** 模型可见输入合同 MUST 支持 `equipmentAvailability = "no_external_equipment"` 表达用户没有外部训练器械
- **AND** 模型可见输入合同 MUST 支持 `requiredEquipmentTags` 表达用户指定可用器械
- **AND** 模型可见输入合同 MUST 支持 `supportRequirementTags` 表达地面/瑜伽垫、椅子/墙面、健身房固定设施、搭档或户外空间等支撑/场地条件
- **AND** 模型可见输入合同 MUST 支持 `setupComplexityMax` 或等价字段表达最大可接受准备复杂度
- **AND** 模型可见输入合同 MUST 支持 `impactLevel` 表达低冲击等确定性动作属性
- **AND** 模型可见输入合同 MUST 支持 `noiseLevel` 表达安静、正常或较吵等确定性动作属性
- **AND** 这些字段的可选值 MUST 来自共享 execution taxonomy 常量

#### Scenario: muscles 使用 facetCatalog 中真实肌群值
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** 模型可见说明 MUST 表达 `muscles` 必须使用 `metadata.facetCatalog.muscles` 中真实存在的肌群值
- **AND** 说明 MUST 表达宽泛身体区域不能直接写入 `muscles`
- **AND** 说明 MUST 给出最小选择策略：用户说宽泛区域时，从 `facetCatalog.muscles` 中选择更具体肌群；没有合适值时应使用其他约束、澄清或失败收口
- **AND** 服务端 MUST NOT 根据用户原文把宽泛区域词改写成数据库肌群

#### Scenario: Planner 不再看到 published 输入字段
- **WHEN** production registry 序列化 `searchExerciseResources` manifest、input schema、schema description 或 examples
- **THEN** 模型可见输入合同 MUST NOT 包含 `published`
- **AND** examples MUST NOT 包含 `published`
- **AND** 模型 MUST NOT 通过 `published` 控制动作可见性、发布态过滤或数据库查询范围

#### Scenario: 过宽查询不能支撑 visibleOutputs
- **WHEN** `searchExerciseResources` input 只有默认字段，例如只包含 `suitabilities` 或 `sort`
- **AND** input 没有目标约束、器械可用性、执行支撑条件、肌群、难度、目标标签、风险标签、点名动作名称、点名动作 id 或当前 run 可见动作锚点
- **THEN** 模型可见说明 MUST 表达该结果只能用于诊断
- **AND** 该结果 MUST NOT 支撑成功结构化训练输出

### Requirement: `searchExerciseResources` 必须返回查询摘要和动作资源摘要

系统 SHALL 让 `searchExerciseResources` 返回稳定的成功 output，包含实际查询口径、命中数量、截断状态、应用的数据库 facet 摘要、section 分组动作资源摘要和确定性 diagnostics。Handler output MAY 保留 `query.totalMatches` 供服务端、trace 和用户投影使用，但模型可见 observation MUST 通过受控摘要收口。Output MUST NOT 暴露 `bodyRegions`、服务端区域展开结果或模型可消费的 `query.published` 字段。Output MUST 使用新的 execution taxonomy 字段表达动作执行条件；旧 `equipment` / `equipmentZh` 和 `homeRequirement` / `homeRequirementZh` MUST NOT 作为模型可见动作执行条件事实。无论是否传入 `exerciseNames`，output MUST 继续使用 `query`、`groups` 和 `diagnostics`，不得新增名称查询专属顶层结果结构。

#### Scenario: 查询成功并返回动作
- **WHEN** `searchExerciseResources` 使用合法输入完成数据库查询
- **THEN** output MUST 包含 `status: "succeeded"`
- **AND** handler output MUST 包含 `query.sort`、`query.appliedFilters`、`query.totalMatches`、`query.returnedCount`、`query.maxReturned` 和 `query.truncated`
- **AND** output MUST NOT 包含模型可消费的 `query.published`
- **AND** output `query.appliedFilters` MUST NOT 将 `published` 作为 Planner 输入过滤条件
- **AND** 当输入包含 `muscle` 或 `muscles` 时，output MUST 包含实际应用的真实肌群 facet 摘要
- **AND** 当输入包含 `exerciseNames` 时，output MUST 在 `query.appliedFilters` 或等价查询摘要中记录实际应用的 `exerciseNames`
- **AND** 当输入包含 execution taxonomy 字段时，output MUST 在 `query.appliedFilters` 或等价查询摘要中记录实际应用的新 taxonomy 条件
- **AND** output MUST NOT 包含 `bodyRegions` 或 `expandedMuscles`
- **AND** output MUST 包含 `groups`
- **AND** 命中的动作摘要 MUST 出现在对应 `groups.<section>.exercises[]`
- **AND** 每个动作摘要 MUST 至少包含 `exerciseId`、`nameZh`、`nameEn`、execution taxonomy 摘要、主肌群、辅助肌群、`allowedSections`、`goalTags`、`riskTags` 和图片 URL 等动作事实摘要字段
- **AND** 模型可见动作摘要 MUST NOT 使用旧 `equipment` / `equipmentZh` 和 `homeRequirement` / `homeRequirementZh` 作为执行条件字段
- **AND** output MUST NOT 新增 `exerciseNameResults`、`resolvedMentions`、`nameMatches` 或等价并行动作列表字段

#### Scenario: 具体筛选查询命中为空
- **WHEN** `searchExerciseResources` 的合法查询得到 `totalMatches = 0`
- **AND** 输入包含 `exerciseNames`、`requiredExerciseIds`、`muscle`、`muscles`、execution taxonomy 字段、`category`、`suitabilities`、`level`、`goalTag`、`riskTag`、`force` 或 `mechanic` 等具体筛选条件
- **THEN** 工具 MUST 返回成功 output
- **AND** output MUST 保持 `query`、`groups` 和 `diagnostics` 结构
- **AND** output MUST 通过 `query.totalMatches`、`groups.<section>.returnedCount` 和 `diagnostics` 表达查询已执行但没有满足当前筛选条件的动作
- **AND** 模型可见 observation MUST 将该事实收口为 zero-result 状态和必要 diagnostics
- **AND** 模型 MUST NOT 将该 tool result 当作成功动作推荐候选集合
- **AND** 模型 MAY 基于该 tool result 解释当前筛选未命中、发起澄清或在下一轮使用其他 `facetCatalog` 或 execution taxonomy 值重查

### Requirement: `searchExerciseResources` 必须下推数据库查询且不得全表读取

系统 SHALL 为 `searchExerciseResources` 使用专用动作资源查询 repository，在数据库层执行动作名称匹配、结构化数据库 facet、execution taxonomy、section-aware hard filter policy 和排除条件筛选，并避免每次 tool 调用读取全量 `Exercise` 数据后再内存过滤。Repository MUST NOT 使用 `q`、`bodyRegions` 或服务端区域展开构造查询。Repository MUST NOT 从 Planner input 读取 `published`，也 MUST NOT 把 `published` 作为模型可控 hard filter。Repository MUST NOT 从 Planner input 读取旧 `equipment` 或 `homeRequirement`；执行条件筛选 MUST 使用新的 taxonomy 字段。

#### Scenario: Repository 查询下推结构化筛选
- **WHEN** `searchExerciseResources` handler 接收到合法结构化输入
- **THEN** handler MUST 调用专用 repository 查询入口，而不是调用 `listExerciseRecords()`、`listAllExercises()`、旧 `searchExercises()` 或其他全量动作读取入口
- **AND** repository MUST 将 `category`、`suitabilities`、`level`、`force`、`mechanic`、execution taxonomy 字段、`muscle`、`muscles`、`goalTag`、`riskTag`、`exerciseNames`、`requiredExerciseIds` 和 `excludeExerciseIds` 按当前 section 的 hard filter policy 转换为数据库可执行 `where` 条件
- **AND** repository MUST 对 `training` 查询应用 `level`、`force`、`mechanic`、`category`、`goalTag`、`riskTag`、execution taxonomy 字段和 `exerciseNames` hard filters
- **AND** repository MUST 对 `warmup` 和 `stretch` 查询应用 section、execution taxonomy 字段、肌群、`exerciseNames`、`requiredExerciseIds` 和 `excludeExerciseIds` hard filters
- **AND** repository MUST 将 `warmup` 和 `stretch` 查询中传入但未作为 hard filter 使用的字段记录到 `filterApplications.unappliedInputFilters`
- **AND** repository MUST 将 `equipmentAvailability = "no_external_equipment"` 转换为 `requiresExternalEquipment = false`
- **AND** repository MUST 根据 `requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevel` 和 `noiseLevel` 构造对应数据库过滤条件
- **AND** repository MUST NOT 因 `equipmentAvailability = "no_external_equipment"` 自动假设 `supportRequirementTags = ["none"]`
- **AND** repository MUST NOT 因 `equipmentAvailability = "no_external_equipment"` 自动包含或排除 `floor_or_mat`、`chair_or_wall`、`gym_fixture`、`partner` 或 `outdoor_space`，除非 Planner 通过新 taxonomy 字段显式表达该边界
- **AND** repository MUST 将 `muscle` 与 `muscles` 合并去重后，在 `primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles` 和 `secondaryMusclesZh` 中执行 OR 查询
- **AND** repository MUST NOT 引用 `bodyRegions`、`expandExerciseBodyRegionTargetMuscles` 或等价区域展开逻辑
- **AND** repository MUST 使用同一 section hard filter policy 下的 `where` 执行 `count()` 来生成该 section 的 `totalMatches`
- **AND** repository MUST 使用服务端内部固定 `maxReturned` 执行 `findMany({ take: maxReturned + 1 })` 或等价查询来判断 `truncated`
- **AND** `maxReturned`、`take`、`offset`、`page` 或 `pageSize` MUST NOT 由 LLM 输入控制

#### Scenario: Repository 按动作名称字段执行确定性模糊匹配
- **WHEN** `searchExerciseResources` input 包含 `exerciseNames`
- **THEN** repository MUST 只在动作名称字段中执行精确、前缀或包含匹配
- **AND** repository MUST NOT 将 `exerciseNames` 用作肌群、分类、标签、描述、`embeddingText` 或语义相似度查询
- **AND** repository MUST NOT 根据用户原文、历史摘要或 conversationSummary 自行补充 `exerciseNames`
- **AND** 每个 `exerciseNames` 条目 MUST 作为独立名称查询桶处理

#### Scenario: 多名称查询避免候选挤占
- **WHEN** `exerciseNames` 包含多个名称
- **THEN** repository MUST 按名称分桶查询有限候选后合并
- **AND** 单个名称的大量候选 MUST NOT 挤掉其他名称的候选
- **AND** 合并结果 MUST 按 `exerciseId` 去重
- **AND** section 冲突、筛选冲突、未命中或候选过宽 MUST 记录到 `diagnostics`

#### Scenario: 显式执行条件叠加过滤
- **WHEN** `searchExerciseResources` 输入同时包含 `equipmentAvailability = "no_external_equipment"` 和合法 `supportRequirementTags`
- **THEN** repository MUST 同时应用 `requiresExternalEquipment = false` 和该支撑/场地条件
- **AND** 该支撑/场地条件 MUST 来自 Planner 显式输入
- **AND** repository MUST NOT 根据用户原文或 `equipmentAvailability` 值自动选择 `floor_or_mat`、`chair_or_wall`、`gym_fixture`、`none` 或其他支撑/场地条件

### Requirement: `searchExerciseResources` 投影必须保护模型、用户和 trace 边界
系统 SHALL 为 `searchExerciseResources` 提供安全模型观察、用户投影和 trace summary，避免完整 handler output 默认外泄。模型可见 observation MUST 只表达动作库查询事实、section 分组事实、有限动作摘要、查询口径、覆盖摘要和确定性 diagnostics；MUST NOT 暴露业务目标满足度、最终交付指令、下一步 tool 调用指导或固定 workflow。模型可见 observation MUST 使用新的 execution taxonomy 表达动作执行条件，不得暴露旧 `equipment` / `equipmentZh`、`homeRequirement` / `homeRequirementZh` 或完整 `totalMatches` 作为规划输入。

#### Scenario: 模型观察只包含安全事实摘要
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** 模型可见 observation MUST 包含查询事实，例如显式 filters、`returnedCount`、`truncated`、zero-result 状态和应用的数据库 facet 摘要
- **AND** 模型可见 observation MUST NOT 包含完整 `query.totalMatches`
- **AND** 模型可见 observation MAY 包含 `groups`、`sectionSummary`、`availableSections`、`missingSections` 和 `diagnostics`
- **AND** 模型可见 observation MUST 只包含有限动作摘要字段，例如 `exerciseId`、`nameZh`、`nameEn`、execution taxonomy 摘要、`primaryMusclesZh` 和 `allowedSections`
- **AND** 模型可见 observation MUST NOT 包含旧 `equipment`、`equipmentZh`、`homeRequirement` 或 `homeRequirementZh`
- **AND** 模型可见 observation MUST NOT 包含完整数据库对象、完整 handler output、内部 service 对象、训练候选 evidence 或与本次查询无关的诊断 payload
- **AND** 模型可见 observation MUST NOT 包含 `fulfillment`、`satisfied`、`supportsOutputKinds`、`visibleDeliveryBoundary`、`supportSectionCompletionBoundary`、`routinePlanCompositionBoundary` 或等价字段

#### Scenario: 用户投影不生成训练卡片
- **WHEN** Response Renderer 或等价用户投影处理 `searchExerciseResources` 结果
- **THEN** 用户可见投影 MUST 只表达查询口径、命中数量、截断状态和可展示动作摘要
- **AND** 用户可见投影 MUST NOT 生成 routine 卡片、plan 卡片、patch 卡片、保存成功事件或任意旧兼容业务事件
- **AND** 用户可见投影 MAY 展示旧中文字段作为兼容文案
- **AND** 用户可见投影 MUST NOT 将旧中文字段反向写入模型可见 observation

#### Scenario: Trace summary 可诊断且脱敏
- **WHEN** `searchExerciseResources` 被 production Agent 调用
- **THEN** trace MUST 记录 toolName、toolResultId、输入摘要、`totalMatches`、`returnedCount`、`truncated`、duration 和 failureCode
- **AND** trace MAY 记录旧字段到新 taxonomy 的应用摘要或 diagnostics
- **AND** trace MUST NOT 记录完整 handler output、数据库连接对象、secret、跨用户 payload 或未经摘要的大 payload

### Requirement: `searchExerciseResources` examples 必须展示查询能力而非意图分类
系统 SHALL 将 `searchExerciseResources` examples 限定为合法结构化查询输入示例，避免把 examples 变成自然语言意图到输出结构、下一步 tool 或固定 workflow 的映射。Examples MUST 使用新的 execution taxonomy 字段表达器械可用性、支撑/场地、准备复杂度、冲击程度和噪音程度；MUST NOT 使用旧 `equipment` 或 `homeRequirement` 字段。

#### Scenario: Examples 只描述 tool 输入
- **WHEN** Agent 序列化 `searchExerciseResources` examples 给 Planner
- **THEN** examples MUST 展示如何填写结构化查询字段，例如 `suitabilities`、`equipmentAvailability`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevel`、`noiseLevel`、`muscles`、`requiredExerciseIds` 或 `excludeExerciseIds`
- **AND** examples MUST 使用符合当前 schema 的 input
- **AND** examples MUST NOT 包含旧 `equipment`
- **AND** examples MUST NOT 包含旧 `homeRequirement`
- **AND** examples MUST NOT 说明用户出现某个固定短语时必须选择某个 `visibleTrainingProposal.payload.kind`
- **AND** examples MUST NOT 承诺 tool 自己会生成最终训练方案、处方、日程、结构化收口或保存结果
- **AND** examples MUST NOT 指导模型在查询后必须调用某个具体 tool
