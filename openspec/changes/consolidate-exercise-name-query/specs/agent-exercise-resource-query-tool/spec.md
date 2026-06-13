## MODIFIED Requirements

### Requirement: `searchExerciseResources` 输入必须只包含动作列表结构化筛选字段

系统 SHALL 使用严格 input schema 约束 `searchExerciseResources` 入参，字段范围必须对齐当前 `Exercise` 数据库可确定性执行的筛选字段和 tool 合同层定义的稳定查询语义。系统 MUST 删除 `q`，不得再暴露宽口径自然语言查询字段。系统 MUST 新增 `exerciseNames`，用于表达模型已经结构化提取出的点名动作名称数组。系统 MUST 删除 `bodyRegions`，不得再使用高层身体区域 enum 或服务端区域展开替代模型对真实数据库 facet 的选择。系统 MUST NOT 将 `published` 暴露为模型可传 input；动作可用性边界属于服务端数据库事实或下游 validator，不由 Planner 控制。刷新场景 MAY 通过 `excludeExerciseIds` 排除指定动作 id；点名动作已经拥有受控数据库 id 后，MAY 通过 `requiredExerciseIds` 请求返回列表优先包含这些动作。肌群筛选 MUST 使用统一 `muscles` 数组字段表达，一个肌群也写成单项数组。

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
- **AND** 模型可见说明 MUST 表达肌群、器械、难度、目标、场地和 section 查询应使用对应结构化字段

#### Scenario: equipment 使用 canonical no_equipment 模型可见值
- **WHEN** production registry 序列化 `searchExerciseResources` manifest、schema description 或 examples
- **THEN** 模型可见说明 MUST 引导无外部器械查询统一写为 `equipment = "no_equipment"`
- **AND** examples MUST 使用 `equipment: "no_equipment"`
- **AND** 模型可见说明 MUST NOT 把 `"无器械"` 展示为推荐的 tool input 值
- **AND** 用户可见自然语言 MAY 继续使用“无器械”描述训练条件
- **AND** 服务端 MUST NOT 根据用户原文新增关键词、正则、同义词表或短句模板来改写 `equipment`

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
- **AND** input 没有目标约束、器械、肌群、场地、难度、目标标签、风险标签、点名动作名称、点名动作 id 或当前 run 可见动作锚点
- **THEN** 模型可见说明 MUST 表达该结果只能用于诊断
- **AND** 该结果 MUST NOT 支撑成功 `final_answer.visibleOutputs`

### Requirement: `searchExerciseResources` 必须返回查询摘要和动作资源摘要

系统 SHALL 让 `searchExerciseResources` 返回稳定的成功 output，包含实际查询口径、命中数量、截断状态、应用的数据库 facet 摘要、section 分组动作资源摘要和确定性 diagnostics。Output MUST NOT 暴露 `bodyRegions`、服务端区域展开结果或模型可消费的 `query.published` 字段。无论是否传入 `exerciseNames`，output MUST 继续使用 `query`、`groups` 和 `diagnostics`，不得新增名称查询专属顶层结果结构。

#### Scenario: 查询成功并返回动作
- **WHEN** `searchExerciseResources` 使用合法输入完成数据库查询
- **THEN** output MUST 包含 `status: "succeeded"`
- **AND** output MUST 包含 `query.sort`、`query.appliedFilters`、`query.totalMatches`、`query.returnedCount`、`query.maxReturned` 和 `query.truncated`
- **AND** output MUST NOT 包含模型可消费的 `query.published`
- **AND** output `query.appliedFilters` MUST NOT 将 `published` 作为 Planner 输入过滤条件
- **AND** 当输入包含 `muscle` 或 `muscles` 时，output MUST 包含实际应用的真实肌群 facet 摘要
- **AND** 当输入包含 `exerciseNames` 时，output MUST 在 `query.appliedFilters` 或等价查询摘要中记录实际应用的 `exerciseNames`
- **AND** output MUST NOT 包含 `bodyRegions` 或 `expandedMuscles`
- **AND** output MUST 包含 `groups`
- **AND** 命中的动作摘要 MUST 出现在对应 `groups.<section>.exercises[]`
- **AND** 每个动作摘要 MUST 至少包含 `exerciseId`、`nameZh`、`nameEn`、器械、居家条件、主肌群、辅助肌群、`allowedSections`、`goalTags`、`riskTags` 和图片 URL 等动作事实摘要字段
- **AND** output MUST NOT 新增 `exerciseNameResults`、`resolvedMentions`、`nameMatches` 或等价并行动作列表字段

#### Scenario: 具体筛选查询命中为空
- **WHEN** `searchExerciseResources` 的合法查询得到 `totalMatches = 0`
- **AND** 输入包含 `exerciseNames`、`requiredExerciseIds`、`muscle`、`muscles`、`equipment`、`category`、`suitabilities`、`level`、`goalTag`、`riskTag`、`homeRequirement`、`force` 或 `mechanic` 等具体筛选条件
- **THEN** 工具 MUST 返回成功 output
- **AND** output MUST 保持 `query`、`groups` 和 `diagnostics` 结构
- **AND** fulfillment MUST 表示查询事实已完成
- **AND** fulfillment summary MUST 说明查询已执行但没有满足当前筛选条件的动作
- **AND** 模型 MUST NOT 将该 tool result 当作成功动作推荐候选集合
- **AND** 模型 MAY 基于该 tool result 解释当前筛选未命中、发起澄清或在下一轮使用其他 `facetCatalog` 值重查

### Requirement: `searchExerciseResources` 必须下推数据库查询且不得全表读取

系统 SHALL 为 `searchExerciseResources` 使用专用动作资源查询 repository，在数据库层执行动作名称匹配、结构化数据库 facet、tool 合同层确定性映射、section-aware hard filter policy 和排除条件筛选，并避免每次 tool 调用读取全量 `Exercise` 数据后再内存过滤。Repository MUST NOT 使用 `q`、`bodyRegions` 或服务端区域展开构造查询。Repository MUST NOT 从 Planner input 读取 `published`，也 MUST NOT 把 `published` 作为模型可控 hard filter。

#### Scenario: Repository 查询下推结构化筛选
- **WHEN** `searchExerciseResources` handler 接收到合法结构化输入
- **THEN** handler MUST 调用专用 repository 查询入口，而不是调用 `listExerciseRecords()`、`listAllExercises()`、旧 `searchExercises()` 或其他全量动作读取入口
- **AND** repository MUST 将 `category`、`suitabilities`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`muscles`、`goalTag`、`riskTag`、`exerciseNames`、`requiredExerciseIds` 和 `excludeExerciseIds` 按当前 section 的 hard filter policy 转换为数据库可执行 `where` 条件
- **AND** repository MUST 对 `training` 查询应用 `level`、`force`、`mechanic`、`category`、`goalTag`、`riskTag` 和 `exerciseNames` hard filters
- **AND** repository MUST 对 `warmup` 和 `stretch` 查询应用 section、器械、场地、肌群、`exerciseNames`、`requiredExerciseIds` 和 `excludeExerciseIds` hard filters
- **AND** repository MUST 将 `warmup` 和 `stretch` 查询中传入但未作为 hard filter 使用的字段记录到 `filterApplications.unappliedInputFilters`
- **AND** repository MUST 将 `equipment = "no_equipment"` 或 `"无器械"` 映射为数据库自重动作查询条件，例如 `equipment = "body only"` 或 `equipmentZh = "自重"`
- **AND** repository MUST NOT 因 `equipment = "no_equipment"` 或 `"无器械"` 自动添加 `homeRequirement = "none"`、`homeRequirementZh = "无器械"` 或等价居家条件过滤
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

#### Scenario: 显式环境条件叠加过滤
- **WHEN** `searchExerciseResources` 输入同时包含 `equipment = "no_equipment"` 和合法 `homeRequirement`
- **THEN** repository MUST 同时应用自重动作查询条件和该环境条件
- **AND** 该环境条件 MUST 来自 Planner 显式输入
- **AND** repository MUST NOT 根据用户原文或 `equipment` 值自动选择 `floor`、`support`、`none` 或其他环境条件

### Requirement: `searchExerciseResources` 必须用现有列表结构返回 requiredExerciseIds

系统 SHALL 在不改变 `searchExerciseResources` 输出主结构的前提下支持 `requiredExerciseIds`。指定动作成功纳入时 MUST 出现在现有 `groups.<section>.exercises` 数组中；无法纳入时 MUST 通过现有 `diagnostics` 说明原因。`exerciseNames` 与 `requiredExerciseIds` 均为正向动作锚点，但 `exerciseNames` 表达名称匹配，`requiredExerciseIds` 表达受控数据库 id。

#### Scenario: requiredExerciseIds 纳入现有 exercises 列表
- **WHEN** `searchExerciseResources` 输入包含 `requiredExerciseIds = ["Pushups", "Bodyweight_Squat", "Plank"]`
- **AND** 这些动作存在、发布态可用且适配目标 section
- **THEN** output MUST 继续使用 `groups.<section>.exercises`
- **AND** 对应动作 MUST 出现在该数组中
- **AND** output MUST NOT 新增 `requiredMatches`、`supplementalMatches`、`selectedRequiredExercises` 或等价并行动作列表字段

#### Scenario: requiredExerciseIds 与筛选条件不完全一致
- **WHEN** 某个 required exercise 与 `exerciseNames`、`level`、`equipment`、`homeRequirement`、`muscle`、`muscles` 或其他合法筛选字段不完全一致
- **THEN** tool MUST 在 `diagnostics` 中返回稳定 code 和有限说明
- **AND** diagnostics MUST 包含相关 `exerciseId` 和冲突字段摘要
- **AND** tool MUST NOT 通过服务端自然语言判断替模型决定是否放弃该用户点名动作

#### Scenario: requiredExerciseIds 无法纳入
- **WHEN** 某个 required exercise 不存在、未发布、被排除或不能用于目标 section
- **THEN** tool MUST 不把该动作放入 `groups.<section>.exercises`
- **AND** tool MUST 在 `diagnostics` 中返回稳定 code，例如 `required_exercise_not_found`、`required_exercise_unpublished`、`required_exercise_excluded` 或 `required_exercise_section_conflict`
- **AND** 模型 MAY 基于该诊断澄清、放宽条件重查或解释当前无法包含该动作

## ADDED Requirements

### Requirement: `searchExerciseResources` 必须支持点名动作名称查询

系统 SHALL 在 `searchExerciseResources` 中支持 `exerciseNames` 输入字段，用于查询模型已经结构化提取出的用户点名动作名称。`exerciseNames` MUST 只按动作名称字段执行确定性匹配，MUST NOT 表示语义搜索、向量召回或服务端自然语言理解。

#### Scenario: exerciseNames 支持多个动作名
- **WHEN** Planner 调用 `searchExerciseResources` 并传入 `exerciseNames = ["俯卧撑", "深蹲", "平板支撑"]`
- **AND** 同时传入 `suitabilities = ["training"]`
- **THEN** tool MUST 按每个名称查询发布态动作候选
- **AND** 成功候选 MUST 合并进入现有 `groups.training.exercises[]`
- **AND** output MUST NOT 新增 `exerciseNameResults`、`resolvedMentions`、`nameMatches` 或等价并行动作列表字段

#### Scenario: exerciseNames 可与结构化筛选组合
- **WHEN** Planner 调用 `searchExerciseResources` 并同时传入 `exerciseNames`、`suitabilities`、`equipment`、`level`、`homeRequirement` 或 `muscles`
- **THEN** tool MUST 同时应用名称匹配和合法结构化筛选
- **AND** 不满足筛选条件的名称候选 MUST 不进入 `groups.<section>.exercises[]`
- **AND** tool MUST 通过 `diagnostics` 表达名称存在但与 section 或筛选条件冲突

#### Scenario: 服务端不抽取 exerciseNames
- **WHEN** `/api/chat`、LangChain runtime、tool wrapper、handler 或 repository 处理用户自然语言输入
- **THEN** 服务端 MUST NOT 根据用户原文、关键词、正则、同义词表、短句模板、历史摘要或 conversationSummary 抽取或补写 `exerciseNames`
- **AND** Planner MUST remain responsible for choosing `exerciseNames` based on model-visible context, manifest, observations and tool results

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

### Requirement: `searchExerciseResources` 必须具备名称查询回归验证

系统 SHALL 为 `exerciseNames`、`q` 移除、输出结构稳定和无服务端语义分流提供自动化测试。

#### Scenario: Tool 单测覆盖多名称查询
- **WHEN** tool-level test 调用 `searchExerciseResources` 并传入 `exerciseNames = ["俯卧撑", "深蹲", "平板支撑"]`
- **THEN** 测试 MUST 证明查询结果使用 `groups.<section>.exercises[]`
- **AND** 测试 MUST 证明 output 不包含 `exerciseNameResults`、`resolvedMentions`、`nameMatches` 或等价并行结构
- **AND** 测试 MUST 覆盖成功命中、未命中、section 冲突、筛选冲突、候选去重和 projection / redaction 边界

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

