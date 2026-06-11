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

系统 SHALL 使用严格 input schema 约束 `searchExerciseResources` 入参，字段范围必须对齐当前 `Exercise` 数据库可确定性执行的筛选字段和 tool 合同层定义的稳定查询语义。系统 MUST 删除 `bodyRegions`，不得再使用高层身体区域 enum 或服务端区域展开替代模型对真实数据库 facet 的选择。系统 MUST NOT 将 `published` 暴露为模型可传 input；动作可用性边界属于服务端数据库事实或下游 validator，不由 Planner 控制。刷新场景 MAY 通过 `excludeExerciseIds` 排除指定动作 id；点名动作已解析为数据库 id 后，MAY 通过 `requiredExerciseIds` 请求返回列表优先包含这些动作。肌群筛选 MUST 使用统一 `muscles` 数组字段表达，一个肌群也写成单项数组。

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
- **AND** 说明 SHOULD 给出最小选择策略：用户说宽泛区域时，从 `facetCatalog.muscles` 中选择更具体肌群；没有合适值时应使用其他约束、澄清或失败收口
- **AND** 服务端 MUST NOT 根据用户原文把宽泛区域词改写成数据库肌群

#### Scenario: Planner 不再看到 published 输入字段
- **WHEN** production registry 序列化 `searchExerciseResources` manifest、input schema、schema description 或 examples
- **THEN** 模型可见输入合同 MUST NOT 包含 `published`
- **AND** examples MUST NOT 包含 `published`
- **AND** 模型 MUST NOT 通过 `published` 控制动作可见性、发布态过滤或数据库查询范围

#### Scenario: 过宽查询不能支撑 visibleOutputs
- **WHEN** `searchExerciseResources` input 只有默认字段，例如只包含 `suitabilities` 或 `sort`
- **AND** input 没有目标约束、器械、肌群、场地、难度、目标标签、点名动作或当前 run 可见动作锚点
- **THEN** 模型可见说明 MUST 表达该结果只能用于诊断
- **AND** 该结果 MUST NOT 支撑成功 `final_answer.visibleOutputs`

### Requirement: `searchExerciseResources` 必须返回查询摘要和动作资源摘要

系统 SHALL 让 `searchExerciseResources` 返回稳定的成功 output，包含实际查询口径、命中数量、截断状态、应用的数据库 facet 摘要和有限动作资源摘要。Output MUST NOT 暴露 `bodyRegions`、服务端区域展开结果或模型可消费的 `query.published` 字段。

#### Scenario: 查询成功并返回动作
- **WHEN** `searchExerciseResources` 使用合法输入完成数据库查询
- **THEN** output MUST 包含 `status: "succeeded"`
- **AND** output MUST 包含 `query.sort`、`query.appliedFilters`、`query.totalMatches`、`query.returnedCount`、`query.maxReturned` 和 `query.truncated`
- **AND** output MUST NOT 包含模型可消费的 `query.published`
- **AND** output `query.appliedFilters` MUST NOT 将 `published` 作为 Planner 输入过滤条件
- **AND** 当输入包含 `muscle` 或 `muscles` 时，output MUST 包含实际应用的真实肌群 facet 摘要
- **AND** output MUST NOT 包含 `bodyRegions` 或 `expandedMuscles`
- **AND** output MUST 包含 `exercises`
- **AND** 每个动作摘要 MUST 至少包含 `id`、`nameZh`、`nameEn`、器械、居家条件、主肌群、辅助肌群、`allowedSections`、`goalTags`、`riskTags` 和图片 URL 等动作事实摘要字段

#### Scenario: 具体筛选查询命中为空
- **WHEN** `searchExerciseResources` 的合法查询得到 `totalMatches = 0`
- **AND** 输入包含 `muscle`、`muscles`、`equipment`、`category`、`suitabilities`、`level`、`goalTag`、`riskTag`、`homeRequirement`、`force` 或 `mechanic` 等具体筛选条件
- **THEN** 工具 MUST 返回成功 output
- **AND** fulfillment MUST 表示查询事实已完成
- **AND** fulfillment summary MUST 说明查询已执行但没有满足当前筛选条件的动作
- **AND** 模型 MUST NOT 将该 tool result 当作成功动作推荐候选集合
- **AND** 模型 MAY 基于该 tool result 解释当前筛选未命中、发起澄清或在下一轮使用其他 `facetCatalog` 值重查

### Requirement: `searchExerciseResources` 必须下推数据库查询且不得全表读取

系统 SHALL 为 `searchExerciseResources` 使用专用动作资源查询 repository，在数据库层执行结构化数据库 facet、tool 合同层确定性映射、section-aware hard filter policy 和排除条件筛选，并避免每次 tool 调用读取全量 `Exercise` 数据后再内存过滤。Repository MUST NOT 使用 `bodyRegions` 或服务端区域展开构造查询。Repository MUST NOT 从 Planner input 读取 `published`，也 MUST NOT 把 `published` 作为模型可控 hard filter。

#### Scenario: Repository 查询下推结构化筛选
- **WHEN** `searchExerciseResources` handler 接收到合法结构化输入
- **THEN** handler MUST 调用专用 repository 查询入口，而不是调用 `listExerciseRecords()`、`listAllExercises()`、旧 `searchExercises()` 或其他全量动作读取入口
- **AND** repository MUST 将 `category`、`suitabilities`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`muscles`、`goalTag`、`riskTag`、`q`、`requiredExerciseIds` 和 `excludeExerciseIds` 按当前 section 的 hard filter policy 转换为数据库可执行 `where` 条件
- **AND** repository MUST 对 `training` 查询应用 `level`、`force`、`mechanic`、`category`、`goalTag`、`riskTag` 和 `q` hard filters
- **AND** repository MUST 对 `warmup` 和 `stretch` 查询只应用 section、器械、场地、肌群、`requiredExerciseIds` 和 `excludeExerciseIds` hard filters
- **AND** repository MUST 将 `warmup` 和 `stretch` 查询中传入但未作为 hard filter 使用的字段记录到 `filterApplications.unappliedInputFilters`
- **AND** repository MUST 将 `equipment = "no_equipment"` 或 `"无器械"` 映射为数据库自重动作查询条件，例如 `equipment = "body only"` 或 `equipmentZh = "自重"`
- **AND** repository MUST NOT 因 `equipment = "no_equipment"` 或 `"无器械"` 自动添加 `homeRequirement = "none"`、`homeRequirementZh = "无器械"` 或等价居家条件过滤
- **AND** repository MUST 将 `muscle` 与 `muscles` 合并去重后，在 `primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles` 和 `secondaryMusclesZh` 中执行 OR 查询
- **AND** repository MUST NOT 引用 `bodyRegions`、`expandExerciseBodyRegionTargetMuscles` 或等价区域展开逻辑
- **AND** repository MUST 使用同一 section hard filter policy 下的 `where` 执行 `count()` 来生成该 section 的 `totalMatches`
- **AND** repository MUST 使用服务端内部固定 `maxReturned` 执行 `findMany({ take: maxReturned + 1 })` 或等价查询来判断 `truncated`
- **AND** `maxReturned`、`take`、`offset`、`page` 或 `pageSize` MUST NOT 由 LLM 输入控制

#### Scenario: 显式环境条件叠加过滤
- **WHEN** `searchExerciseResources` 输入同时包含 `equipment = "no_equipment"` 和合法 `homeRequirement`
- **THEN** repository MUST 同时应用自重动作查询条件和该环境条件
- **AND** 该环境条件 MUST 来自 Planner 显式输入
- **AND** repository MUST NOT 根据用户原文或 `equipment` 值自动选择 `floor`、`support`、`none` 或其他环境条件

### Requirement: `searchExerciseResources` 投影必须保护模型、用户和 trace 边界
系统 SHALL 为 `searchExerciseResources` 提供安全模型观察、用户投影和 trace summary，避免完整 handler output 默认外泄。

#### Scenario: 模型观察只包含安全摘要
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** 模型可见 observation MUST 包含 `toolResultId`、`totalMatches`、`returnedCount`、`truncated` 和 `appliedFilters`
- **AND** 模型可见 observation MUST 只包含有限动作摘要字段，例如 `id`、`nameZh`、`nameEn`、`equipmentZh`、`primaryMusclesZh` 和 `allowedSections`
- **AND** 模型可见 observation MUST NOT 包含完整数据库对象、完整 handler output、内部 service 对象、训练候选 evidence 或与本次查询无关的诊断 payload

#### Scenario: 用户投影不生成训练卡片
- **WHEN** Response Renderer 或等价用户投影处理 `searchExerciseResources` 结果
- **THEN** 用户可见投影 MUST 只表达查询口径、命中数量、截断状态和可展示动作摘要
- **AND** 用户可见投影 MUST NOT 生成 routine 卡片、plan 卡片、patch 卡片、保存成功事件或任意旧兼容业务事件

#### Scenario: Trace summary 可诊断且脱敏
- **WHEN** `searchExerciseResources` 被 production Agent 调用
- **THEN** trace MUST 记录 toolName、toolResultId、输入摘要、`totalMatches`、`returnedCount`、`truncated`、duration 和 failureCode
- **AND** trace MUST NOT 记录完整 handler output、数据库连接对象、secret、跨用户 payload 或未经摘要的大 payload

### Requirement: `searchExerciseResources` 模型可见说明必须表达业务边界

系统 SHALL 在 tool manifest、schema 描述、examples、facet catalog 或 observation 中为模型提供 `searchExerciseResources` 的使用边界，且不得把该 tool 的业务特例写入通用 Agent prompt。该边界 SHALL 表达 tool 只接受数据库真实 facet；高层自然语言目标由模型基于 `facetCatalog` 自主选择结构化字段。

#### Scenario: Manifest 说明何时使用和何时不用
- **WHEN** Agent 构造 Planner 可见 tool manifest
- **THEN** `searchExerciseResources` 的模型可见说明 MUST 表达它适用于查询符合结构化数据库 facet 的发布态动作列表
- **AND** 模型可见说明 MUST 表达 `muscle` 只用于单个真实肌群 facet
- **AND** 模型可见说明 MUST 表达 `muscles` 用于多个真实肌群 facet 的 OR 查询
- **AND** 模型可见说明 MUST 表达所有 facet 值应优先来自 `facetCatalog`
- **AND** 模型可见说明 MUST 表达 `bodyRegions` 已不是可用字段，不得输出
- **AND** 模型可见说明 MUST 表达 `excludeExerciseIds` 只用于排除用户已看到或用户明确要求排除的动作 id
- **AND** 模型可见说明 MUST 表达“再推荐一批 / 换一批”应尽量基于当前 run 已恢复的用户可见动作事实填充排除 id
- **AND** 模型可见说明 MUST 表达未展示给用户的内部候选或未读取完整事实不得被默认排除
- **AND** 模型可见说明 MUST 表达它不适用于生成训练、保存结果、读取单个动作完整详情、解析唯一动作名、统计全库 facet 或构建 routine / plan / patch 候选集合
- **AND** 模型可见说明 MUST 表达成功且 `satisfied=true` 的结果可以通过 `usedToolResultIds` 支撑普通 `final_answer`
- **AND** 模型可见说明 MUST 表达 failed、非法输入或不可消费结果不能支撑成功动作推荐
- **AND** 模型可见说明 MUST NOT 把自然语言短语写成固定 facet 选择规则
- **AND** 通用 Agent prompt MUST NOT 新增 `searchExerciseResources` toolName 特例或服务端关键词路由规则

### Requirement: `searchExerciseResources` 必须具备 tool-level 验证
系统 SHALL 为 `searchExerciseResources` 提供直接覆盖真实 tool 执行入口的自动化测试，而不能只验证 registry 或 manifest 暴露。

#### Scenario: Tool 单测覆盖业务行为和安全边界
- **WHEN** 本 change 完成实现
- **THEN** 自动化测试 MUST 直接覆盖 `searchExerciseResources` 的 handler、`executeTool` 或当前真实 runtime 执行入口
- **AND** 测试 MUST 覆盖 `published` 不再出现在模型可见 input schema、description、examples、query summary 或 `appliedFilters` 中
- **AND** 测试 MUST 覆盖模型传入 `published` 会作为未知字段被 schema 拒绝，且失败反馈包含字段级 issue
- **AND** 测试 MUST 覆盖成功路径、schema 拒绝、空结果、数据库下推查询、projection / redaction、trace summary、handler 失败归一化、`excludeExerciseIds` 去重、数量上限、非法 id 拒绝、数据库层排除、排除后候选不足和摘要投影
- **AND** 测试 MUST 使用接近 AITest 真实动作库查询的健身业务输入
- **AND** 测试 MUST 证明被排除动作不会出现在返回动作中
- **AND** 测试 MUST 证明该 tool 仍不产出 `candidateSetId`、`candidate_set` resource、训练卡片或保存事件

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
系统 SHALL 让 `searchExerciseResources` 的模型可见 observation 表达当前 tool result 提供了哪些动作事实、这些事实可如何被最终输出引用，以及哪些字段不是 tool result 自带的最终训练结构。

#### Scenario: Observation 表达可用动作事实
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** 模型可见 observation MUST 表达当前结果提供动作事实原料
- **AND** 模型可见 observation MUST 表达 `groups.<section>.exercises[*].exerciseId` 可作为 `visibleTrainingProposal.exerciseItems[*].exerciseId` 的事实来源
- **AND** 模型可见 observation MUST 表达当前结果只覆盖实际返回的 section
- **AND** 模型可见 observation MUST NOT 将 tool result 表达为已经生成的最终 `visibleTrainingProposal`

#### Scenario: Observation 表达结构缺口
- **WHEN** 模型可见 observation 描述 `searchExerciseResources` 的结果边界
- **THEN** observation MUST 表达 `prescription`、`schedule` 和最终 `payload.kind` 不是该 tool 的输出事实
- **AND** observation MUST 表达如果模型选择输出的最终结构需要当前 observation 未提供的 section 或字段，模型应基于可见事实自主决定继续调用 tool、澄清或输出当前事实可支撑的结构
- **AND** observation MUST NOT 要求模型按照固定调用顺序继续调用 tool

### Requirement: `searchExerciseResources` examples 必须展示查询能力而非意图分类
系统 SHALL 将 `searchExerciseResources` examples 限定为合法结构化查询输入示例，避免把 examples 变成自然语言意图到输出结构的固定映射。

#### Scenario: Examples 只描述 tool 输入
- **WHEN** Agent 序列化 `searchExerciseResources` examples 给 Planner
- **THEN** examples MUST 展示如何填写结构化查询字段，例如 `suitabilities`、`equipment`、`homeRequirement`、`level`、`bodyRegions`、`requiredExerciseIds` 或 `excludeExerciseIds`
- **AND** examples MUST 使用符合当前 schema 的 input
- **AND** examples MUST NOT 说明用户出现某个固定短语时必须选择某个 `visibleTrainingProposal.payload.kind`
- **AND** examples MUST NOT 承诺 tool 自己会生成最终训练方案、处方、日程或保存结果

### Requirement: `searchExerciseResources` 模型可见说明必须表达 group 与 section 的对应关系
系统 SHALL 在 `searchExerciseResources` 的模型可见 manifest、schema description、examples 或等价 output 说明中表达 `groups.<section>` 的分组语义。说明 MUST 明确 `groups.<section>.exercises[]` 是该查询结果中对应 section 的动作事实来源，`visibleTrainingProposal.exerciseItems[*].section` 应与使用的 group key 和动作 `allowedSections` 保持一致。说明 MUST 使用中文描述业务含义，`groups`、`section`、`visibleTrainingProposal`、`exerciseItems`、`allowedSections` 等技术标识保持英文原样。

#### Scenario: manifest 表达 groups section 语义
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** manifest 中的 `whenToUse`、`whenNotToUse`、schema description 或 examples description MUST 表达 `groups.<section>` 与 `visibleTrainingProposal.exerciseItems[*].section` 的对应关系
- **AND** manifest MUST 表达 `allowedSections` 是动作可进入哪些 section 的动作事实字段
- **AND** manifest MUST NOT 要求 Planner 在特定失败或缺口下必须调用某个固定 tool
- **AND** manifest MUST NOT 将 `searchExerciseResources` 描述成 routine、plan、patch、训练卡片或保存工具

### Requirement: `searchExerciseResources` model observation 必须包含短 `groupSemantics`
系统 SHALL 在 `searchExerciseResources` 成功结果的模型可见 observation 中加入短小 `groupSemantics` 摘要，用于解释当前 observation 的 `groups.<section>` 分组含义。`groupSemantics` MUST 只解释已有 `groups` 结构，不得复制动作列表、不得新增重复证据表、不得注册 resource，也不得改变 handler output 合同。

#### Scenario: observation 投影包含 groupSemantics
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 包含 `groupSemantics`
- **AND** `groupSemantics` MUST 表达 `groups.<section>.exercises[]` 中的动作是该 section 分组下返回的动作事实
- **AND** `groupSemantics` MUST 表达生成 `visibleTrainingProposal.exerciseItems[]` 时 `section` 与使用的 `groups.<section>` 和动作 `allowedSections` 之间存在事实对应关系
- **AND** `groupSemantics` MUST NOT 包含完整 handler output、完整数据库对象、secret 或跨用户 payload

#### Scenario: observation 不新增重复证据表
- **WHEN** `searchExerciseResources` model observation 生成 `groupSemantics`
- **THEN** observation MUST NOT 新增 `sectionEvidence`、`exerciseSectionEvidence`、`visibleTrainingProposalEvidence` 或等价重复动作证据表
- **AND** observation MUST NOT 复制 `groups.<section>.exercises[]` 中的 `exerciseId` 列表到第二套证据结构
- **AND** observation MUST NOT 产出 `candidate_set` resource 或其他训练生成消费 resource

### Requirement: `searchExerciseResources` 必须用现有列表结构返回 requiredExerciseIds

系统 SHALL 在不改变 `searchExerciseResources` 输出主结构的前提下支持 `requiredExerciseIds`。指定动作成功纳入时 MUST 出现在现有 `groups.<section>.exercises` 数组中；无法纳入时 MUST 通过现有 `diagnostics` 说明原因。

#### Scenario: requiredExerciseIds 纳入现有 exercises 列表
- **WHEN** `searchExerciseResources` 输入包含 `requiredExerciseIds = ["Pushups", "Bodyweight_Squat", "Plank"]`
- **AND** 这些动作存在、发布态可用且适配目标 section
- **THEN** output MUST 继续使用 `groups.<section>.exercises`
- **AND** 对应动作 MUST 出现在该数组中
- **AND** output MUST NOT 新增 `requiredMatches`、`supplementalMatches`、`selectedRequiredExercises` 或等价并行动作列表字段

#### Scenario: requiredExerciseIds 与筛选条件不完全一致
- **WHEN** 某个 required exercise 与 `q`、`level`、`equipment`、`homeRequirement`、`bodyRegions`、`muscle` 或其他筛选字段不完全一致
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
- **THEN** 测试 MUST 覆盖从 `resolveExerciseResourceMentions` 得到 `俯卧撑`、`深蹲`、`平板支撑` 的 exerciseId 后传入 `searchExerciseResources.requiredExerciseIds`
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
- **AND** 说明 MUST 表达最终刷新后的结构必须由 `final_answer.visibleOutputs[]` 中的 `visibleTrainingProposal.payload` 承载
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

### Requirement: `searchExerciseResources` 必须向 Planner 暴露完整数据库 facetCatalog

系统 SHALL 将当前发布态动作库中 `searchExerciseResources` 支持查询的可执行 facet 作为模型可见 `facetCatalog` 暴露给 Planner。`facetCatalog` MUST 来自当前数据库事实、同一生产事实源或 tool 合同层稳定查询语义，MUST 去重、过滤空值并使用确定性排序；系统 MUST NOT 用手写自然语言映射表替代数据库事实，MUST NOT 因集合大小裁剪任何支持查询的 facet 类别。

#### Scenario: facetCatalog 包含全部支持查询的 facet 类别
- **WHEN** production Agent registry 或等价 model input builder 构造 Planner 可见输入
- **THEN** Planner MUST 能看到 `searchExerciseResources.facetCatalog`
- **AND** `facetCatalog` MUST 包含完整 `muscles`
- **AND** `facetCatalog` MUST 包含完整 `categories`
- **AND** `facetCatalog` MUST 包含完整 `levels`
- **AND** `facetCatalog` MUST 包含完整 `forces`
- **AND** `facetCatalog` MUST 包含完整 `mechanics`
- **AND** `facetCatalog` MUST 包含完整 `equipment`
- **AND** `facetCatalog` MUST 包含完整 `homeRequirements`
- **AND** `facetCatalog` MUST 包含完整 `goalTags`
- **AND** `facetCatalog` MUST 包含完整 `riskTags`
- **AND** `facetCatalog` MUST 包含完整 `suitabilities`

#### Scenario: equipment catalog 包含 no_equipment 语义
- **WHEN** production Agent registry 或等价 model input builder 构造 `facetCatalog.equipment`
- **THEN** `facetCatalog.equipment` MUST 包含用于 Planner 查询的 `no_equipment` 或 `无器械` 语义
- **AND** 该语义 MUST 被描述为 tool 合同层稳定查询语义
- **AND** 该语义 MUST NOT 被描述为数据库原始 `homeRequirement` facet

#### Scenario: homeRequirements catalog 不暴露无器械
- **WHEN** production Agent registry 或等价 model input builder 构造 `facetCatalog.homeRequirements`
- **THEN** `facetCatalog.homeRequirements` MUST NOT 包含 `none`
- **AND** `facetCatalog.homeRequirements` MUST NOT 包含 `无器械`
- **AND** `facetCatalog.homeRequirements` MUST 只保留环境、场地或支撑条件类可执行值

#### Scenario: facetCatalog 来自发布态数据库事实
- **WHEN** 数据库发布态 `Exercise` 中新增、删除或修改某个支持查询的 facet 值
- **THEN** 下一次 production registry 或 model input 构造 MUST 使用更新后的 facet 值
- **AND** `facetCatalog` MUST 过滤空值和重复值
- **AND** `facetCatalog` MUST NOT 因 prompt token、集合大小或手写优先级隐藏某个支持查询的 facet 类别
- **AND** `facetCatalog` MAY 包含 `facetCatalogHash`、`source`、`publishedOnly` 或 `generatedAt` 等诊断字段，但这些字段 MUST NOT 替代完整 facet 列表

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

### Requirement: `searchExerciseResources` observation 必须表达 section-scoped 动作事实边界
`searchExerciseResources` 的模型可见 observation SHALL 表达动作事实只覆盖实际返回的 `groups.<section>`。若最终结构需要未返回的 section，Planner MUST 继续获取缺失事实、澄清、失败收口或输出当前事实可支撑的结构。

#### Scenario: training-only 查询只支撑 training
- **WHEN** `searchExerciseResources` 只返回 `groups.training`
- **THEN** model observation MUST 表达 `availableSections = ["training"]` 或等价信息
- **AND** model observation MUST 表达生成 `routine` 或 `plan` 仍缺少 `warmup` 和 `stretch`
- **AND** model observation MUST 表达不得把 `groups.training` 中且 `allowedSections` 不包含 `warmup` 或 `stretch` 的动作写入这些 section

#### Scenario: 补齐 section 不固定调用顺序
- **WHEN** `searchExerciseResources` observation 表达存在缺失 section
- **THEN** observation MUST 表达可恢复方向包括继续查询缺失 section、澄清、失败收口或输出当前事实可支撑结构
- **AND** observation MUST NOT 表达成固定必须调用某个 tool、固定调用次数或固定调用顺序

#### Scenario: Query result 不等于最终训练方案
- **WHEN** `searchExerciseResources` 执行成功
- **THEN** model observation MUST 表达该 tool 只提供动作事实原料
- **AND** model observation MUST 表达 `prescription`、`schedule` 和最终 `payload.kind` 不是该 tool 的输出事实
- **AND** model observation MUST 表达最终训练结构仍必须由 `final_answer.visibleOutputs[]` 承载

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
- **THEN** observation MUST 表达如果目标是操作已有对象，应先基于当前可见引用事实确认对象
- **AND** observation MUST 表达引用对象不可见时，不得使用本次动作查询结果宣称刷新、替换或调整成功
- **AND** observation MUST NOT 要求固定调用 `inspectVisibleTrainingProposals`、固定调用 `read_recent` 或固定输出某个 `payload.kind`

### Requirement: `searchExerciseResources` 必须分离器械可用性和居家环境条件

系统 SHALL 在模型可见合同、执行合同和测试中分离器械可用性与居家环境条件。`equipment` SHALL 表达动作需要或不需要的器械；`homeRequirement` SHALL 表达环境、场地或支撑条件。系统 MUST NOT 将“无器械”继续作为 `homeRequirement` 的模型可见值，也 MUST NOT 通过旧兼容把错误输入静默转换成新合同。

#### Scenario: 无器械查询返回自重且可需要地面动作
- **WHEN** `searchExerciseResources` 使用 `equipment = "no_equipment"` 或 `equipment = "无器械"` 查询 `suitabilities = ["training"]`
- **AND** 发布态动作库中存在 `equipment = "body only"` 且 `homeRequirement = "floor"` 的 training 动作
- **THEN** 这些动作 MUST 有资格进入数据库查询结果
- **AND** 系统 MUST NOT 因这些动作的 `homeRequirement` 不是 `none` 而排除它们

#### Scenario: 不做旧 homeRequirement 兼容
- **WHEN** 模型输入 `homeRequirement = "none"` 或 `homeRequirement = "无器械"`
- **THEN** tool handler MUST NOT 将其自动迁移成 `equipment = "no_equipment"`
- **AND** tool handler MUST NOT 添加 alias、fallback、兼容层或服务端业务分流来修正该输入
- **AND** 该错误输入 MUST 通过 schema、repair 或失败诊断暴露，而不是静默成功

#### Scenario: examples 不展示错误字段组合
- **WHEN** production registry 序列化 `searchExerciseResources` examples
- **THEN** examples MUST NOT 包含 `Pushups` 与 `homeRequirement = "none"` 的组合
- **AND** examples MUST NOT 使用 `homeRequirement = "none"` 或 `homeRequirement = "无器械"` 表达无器械查询
- **AND** 无器械动作查询示例 MUST 使用 `equipment = "no_equipment"` 或 `equipment = "无器械"`

#### Scenario: 不新增服务端语义分流
- **WHEN** 本 change 完成实现
- **THEN** `/api/chat`、Agent core、renderer、tool handler 和 repository MUST NOT 根据用户原文中的“无器械”“徒手”“自重”“俯卧撑”等词选择 `equipment` 或 `homeRequirement`
- **AND** tests MUST prove no new keyword, regex, synonym table or fixed phrase routing is introduced for `searchExerciseResources`
- **AND** Planner MUST remain responsible for selecting `equipment`、`homeRequirement` and other facet filters from model-visible contract

### Requirement: `searchExerciseResources` 必须具备无器械查询合同回归验证

系统 SHALL 为 `no_equipment` 器械语义、`homeRequirement` 模型可见过滤、不做旧兼容和无服务端语义分流提供自动化测试。

#### Scenario: Tool 单测覆盖 no_equipment 查询
- **WHEN** tool-level test 使用 `equipment = "no_equipment"` 或 `equipment = "无器械"`
- **THEN** 测试 MUST 证明 repository 查询包含自重动作条件
- **AND** 测试 MUST 证明 repository 查询没有默认加入 `homeRequirement = "none"` 或 `"无器械"`
- **AND** 测试 MUST 使用包含俯卧撑或等价自重地面动作的真实健身场景 fixture

#### Scenario: Manifest 测试覆盖 Planner 可见合同
- **WHEN** manifest / registry test 检查 Planner 可见 `searchExerciseResources`
- **THEN** 测试 MUST 证明 `facetCatalog.equipment` 包含 `no_equipment` 或 `无器械`
- **AND** 测试 MUST 证明 `facetCatalog.homeRequirements` 不包含 `none` 或 `无器械`
- **AND** 测试 MUST 证明 examples 不再展示 `homeRequirement = "none"` 的无器械查询

#### Scenario: 旧兼容缺失是预期行为
- **WHEN** tool-level test 或 schema test 输入 `homeRequirement = "none"` 或 `"无器械"`
- **THEN** 测试 MUST 证明 handler 不会把它迁移成 `equipment = "no_equipment"`
- **AND** 测试 MUST 证明不存在旧字段 alias、fallback 或兼容成功路径

### Requirement: `searchExerciseResources` 模型可见合同必须支持 routine 正向补齐
`searchExerciseResources` 的模型可见 manifest、schema description、examples 和 observation SHALL 表达：该 tool 只提供动作事实，但当模型目标已经需要 `routine` 且当前结果只覆盖部分 section 时，继续查询缺失 section 是正常组合步骤。该合同 MUST NOT 让 tool 生成最终 `routine`、`plan`、处方、schedule、卡片或保存结果。

#### Scenario: Manifest 表达缺失 section 的正向补查
- **WHEN** Agent 序列化 `searchExerciseResources` manifest
- **THEN** 模型可见说明 MUST 表达明确 `routine` 目标已有 `training` 动作事实时，可以使用相同目标、器械、场地、难度或肌群约束继续查询 `suitabilities = ["warmup", "stretch"]`
- **AND** 模型可见说明 MUST 表达在候选足够时应继续组合完整 `routine`，而不是让用户自行把 `training` 动作列表组合成训练
- **AND** 模型可见说明 MUST 使用中文描述业务含义，`searchExerciseResources`、`suitabilities`、`warmup`、`training`、`stretch`、`routine`、`visibleTrainingProposal` 等技术标识保持英文原样

#### Scenario: Observation 区分可补查缺口和候选不足
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **AND** observation 的 `missingSectionsForRoutineOrPlan` 非空
- **THEN** observation MUST 表达当前结果不能单独支撑成功 `routine`
- **AND** observation MUST 表达若目标已是 `routine` 且当前约束足够，下一步应优先继续查询缺失 section 的动作事实
- **AND** observation MUST 表达缺失 section 查询无候选、约束冲突或查询过宽时，应说明缺口、建议放宽条件、使用 `ask_user` 或不带 `visibleOutputs` 的 `final_answer` 收口

#### Scenario: Tool 仍不承担最终训练生成职责
- **WHEN** `searchExerciseResources` 执行成功
- **THEN** tool output MUST NOT 生成 `visibleTrainingProposal`、`routine`、`plan`、`prescription`、`schedule`、训练卡片、保存事件或 `candidate_set` resource
- **AND** tool handler MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板决定最终输出结构

### Requirement: searchExerciseResources 必须将无目标 broad query 标记为未满足
`searchExerciseResources` SHALL 对缺少可解释筛选条件的 broad query 返回诊断性未满足结果。若 tool input 除默认 `suitabilities`、`published`、`sort` 外没有任何目标、facet、器械、场地、点名动作或当前 run 可见动作锚点，`fulfillment.satisfied` MUST 为 `false`，该 tool result MUST NOT 支撑成功 `final_answer` 或 `visibleTrainingProposal`。

#### Scenario: 无筛选动作查询不能支撑成功训练输出
- **WHEN** Planner 调用 `searchExerciseResources`，input 只包含默认或等价默认的 `suitabilities`、`published`、`sort`
- **THEN** tool execution MAY 返回只读动作摘要
- **AND** `fulfillment.satisfied` MUST be `false`
- **AND** model observation MUST 说明该结果只可用于澄清、解释查询过宽或下一轮 repair
- **AND** model observation MUST 说明不能用该结果输出成功 `final_answer.visibleOutputs[]`

#### Scenario: 有结构化约束的动作查询仍可满足
- **WHEN** Planner 调用 `searchExerciseResources`，input 包含 `q`、`category`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`muscles`、`goalTag`、`riskTag`、`requiredExerciseIds` 或 `excludeExerciseIds` 中至少一类可解释约束
- **THEN** tool fulfillment MAY be `satisfied=true` when the query executes within schema and database boundaries
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
- **AND** observation MUST 表达最终训练输出必须由合法 `final_answer.visibleOutputs[]` 或 grounded terminal action 承载
- **AND** observation MUST NOT 暗示该 tool 已经生成最终 `visibleTrainingProposal`

#### Scenario: 仍缺事实时不能承诺异步继续
- **WHEN** 模型基于 `searchExerciseResources` observation 判断最终结构仍缺 section、动作、处方或 schedule
- **THEN** 模型可见说明 MUST 表达 Planner 应继续合法 `tool_call`、使用 `ask_user` 澄清或明确失败收口
- **AND** 模型可见说明 MUST 表达不得用成功 `final_answer.content` 承诺本轮之后还会自动继续查询或生成

#### Scenario: 成功普通事实回答应引用 satisfied tool result
- **WHEN** Planner 使用 `searchExerciseResources` 的结果回答普通动作事实问题
- **THEN** 模型可见说明 MUST 表达可通过 `final_answer.usedToolResultIds` 引用 `fulfillment.satisfied = true` 的 tool result
- **AND** failed、invalid-input 或 `satisfied=false` 的结果 MUST NOT 支撑成功 `final_answer`

#### Scenario: 不新增服务端动作语义判断
- **WHEN** 实现本 change
- **THEN** `searchExerciseResources` handler MUST NOT 根据用户原文关键词、正则、同义词表、短句模板或具体 phrasing 增删筛选条件
- **AND** `/api/chat` MUST NOT 根据本 tool 的存在新增服务端语义分流

### Requirement: searchExerciseResources 模型可见合同必须阻止缺 section 的 routine 和 plan final
`searchExerciseResources` 的模型可见 manifest、schema description、examples 和 observation SHALL 表达当前查询结果覆盖了哪些 section，以及缺失 section 对 `routine` / `plan` final 输出的影响。当 `missingSectionsForRoutineOrPlan` 非空且模型目标需要 `routine` 或 `plan` 时，模型可见合同 MUST 指向继续查询缺失 section、澄清或失败收口，而不是提交缺 section 的 `visibleOutputs`。

#### Scenario: Manifest 表达缺 section 查询方式
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** manifest MUST 说明当模型已经判断最终目标需要 `routine` 或 `plan`，且当前 observations、tool results 或 resource coverage 显示缺少 `warmup` 或 `stretch` 动作事实时，模型应先获取缺失 section 的动作事实
- **AND** manifest MUST 说明可以通过 `suitabilities` 填写缺失 section，例如 `["warmup", "stretch"]`，查询对应候选
- **AND** manifest MUST 说明缺失 section 未补齐前，不要输出 `final_answer.visibleOutputs[].payload.kind = "routine"` 或 `"plan"`
- **AND** manifest MUST 使用中文描述业务含义，`searchExerciseResources`、`suitabilities`、`warmup`、`stretch`、`routine`、`plan`、`final_answer`、`visibleOutputs`、`payload.kind` 保持英文原样

#### Scenario: Observation 表达 section coverage 和 forbidden final
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 表达本次结果实际返回的 `availableSections`
- **AND** model observation MUST 表达 `sectionSummary`
- **AND** model observation MUST 表达 `missingSectionsForRoutineOrPlan`
- **AND** 当 `missingSectionsForRoutineOrPlan` 非空时，model observation MUST 说明当前结果不能支撑 `routine` 或 `plan` 的成功 `visibleOutputs`
- **AND** 当 `missingSectionsForRoutineOrPlan` 非空时，model observation MUST 说明在缺口补齐前禁止提交 `final_answer.visibleOutputs[].payload.kind = "routine"` 或 `"plan"`

#### Scenario: Observation 给出缺失 section 的下一步但不固定调用顺序
- **WHEN** model observation 描述缺少 `warmup` 或 `stretch`
- **THEN** observation MUST 说明如果最终目标需要 `routine` 或 `plan`，模型可以继续用缺失 section 的 `suitabilities` 查询候选
- **AND** observation MUST 允许模型在事实不足、tool 不可用或约束不足时使用 `ask_user`、失败收口或不输出 `visibleOutputs` 的说明
- **AND** observation MUST NOT 表达成所有请求都必须固定再次调用 `searchExerciseResources`
- **AND** observation MUST NOT 要求固定 tool 调用次数或固定 tool 调用顺序

#### Scenario: Examples 展示缺 section 查询而非自然语言意图映射
- **WHEN** Agent 序列化 `searchExerciseResources` examples 给 Planner
- **THEN** examples MUST 包含使用 `suitabilities = ["warmup", "stretch"]` 查询热身和拉伸候选的合法 input 示例
- **AND** examples MUST NOT 把某个固定用户短语映射成固定 `payload.kind`
- **AND** examples MUST NOT 承诺 `searchExerciseResources` 会生成最终 `routine`、`plan`、`prescription`、`schedule` 或训练卡片

#### Scenario: Tool 仍只提供动作事实
- **WHEN** `searchExerciseResources` 执行成功
- **THEN** tool output MUST 仍只提供发布态动作事实查询结果
- **AND** tool output MUST NOT 生成 `visibleTrainingProposal`
- **AND** tool output MUST NOT 生成 `routine`、`plan`、`prescription` 或 `schedule`
- **AND** tool handler MUST NOT 根据用户自然语言、关键词、短句模板或同义词表替模型选择动作或输出结构

### Requirement: searchExerciseResources examples 必须展示 routine / plan 缺 section 补查输入
`searchExerciseResources` 的模型可见 examples SHALL 展示当目标需要 `routine` 或 `plan`、当前 run 已有 `training` 动作事实但缺少 `warmup` / `stretch` 时，如何沿用当前目标约束查询缺失 section 候选。该 example 只说明动作事实查询输入形态，不得承诺 tool 会生成最终训练结构。

#### Scenario: Examples 包含 warmup 和 stretch 补查
- **WHEN** production registry 序列化 `searchExerciseResources` manifest 给 Planner
- **THEN** manifest examples MUST 包含使用 `suitabilities = ["warmup", "stretch"]` 查询热身和拉伸候选的合法 input
- **AND** example input SHOULD 包含至少一个可解释的真实 facet、器械、场地或难度约束
- **AND** example description MUST 说明这是在 `routine` 或 `plan` 目标已有 `training` 动作事实但缺少支持 section 时的补查
- **AND** example description MUST 使用中文描述业务含义，`searchExerciseResources`、`suitabilities`、`warmup`、`stretch`、`routine`、`plan` 保持英文原样

#### Scenario: Tool 说明与输出类型选择指南一致
- **WHEN** `searchExerciseResources` manifest 描述缺 section 场景
- **THEN** manifest MUST 说明如果模型目标已经需要 `routine` 或 `plan`，且当前 run 只有 `training` 动作事实，模型应优先沿用当前目标约束查询缺失 section
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
- **THEN** manifest MUST NOT 逐段重复 system prompt 中关于 `final_answer.content` 不触发后续自动 tool 调用的完整说明
- **AND** manifest MUST NOT 逐段重复 system prompt 中关于 `usedRefs`、resource id、diagnostic result 和 terminal validator 的完整通用规则
- **AND** manifest 可以用短句说明“最终训练结构由 `final_answer.visibleOutputs[]` 承载”，但不得把该短句扩展成跨 tool 通用终态规则全集

#### Scenario: schema description 保留字段独有含义
- **WHEN** `searchExerciseResources` input schema 被转成 Planner 可见 JSON Schema
- **THEN** `suitabilities` description MUST 保留 `warmup`、`training`、`stretch` 的字段含义
- **AND** `equipment` description MUST 保留 `no_equipment` 或 `无器械` 的 tool 合同层稳定查询语义
- **AND** `homeRequirement` description MUST 保留其只表达环境、场地或支撑条件
- **AND** `requiredExerciseIds` description MUST 表达正向锚点含义
- **AND** `excludeExerciseIds` description MUST 表达负向排除含义
- **AND** schema description MUST NOT 承担 `visibleTrainingProposal` 全局输出选择指南

### Requirement: `searchExerciseResources` examples 必须保留关键输入例子并删除长篇解释
系统 SHALL 为 `searchExerciseResources` 保留少量对模型调用最有帮助的合法 input examples。Examples MUST 展示结构化字段如何填写，而不是解释整套终态输出流程。

#### Scenario: examples 覆盖核心查询形态
- **WHEN** production registry 序列化 `searchExerciseResources` examples
- **THEN** examples MUST 至少覆盖一个受约束动作查询输入
- **AND** examples MUST 覆盖需要补齐 `warmup` / `stretch` section 的合法查询输入，除非 system prompt 和 observation 已通过其他可测试方式完整覆盖该链路
- **AND** 如保留 `requiredExerciseIds` example，example MUST 使用符合当前 schema 的发布态动作 id 形状
- **AND** examples MUST NOT 包含 `bodyRegions`、`muscle`、`limit`、`page`、fake `factRef` 或其他非 input schema 字段

#### Scenario: examples 不变成意图分类表
- **WHEN** examples 描述查询输入
- **THEN** examples MUST NOT 表达用户说某个固定短语时必须选择某个 `payload.kind`
- **AND** examples MUST NOT 表达用户说某个固定短语时必须调用某个 tool
- **AND** examples MUST NOT 承诺 `searchExerciseResources` 自己生成 routine、plan、训练卡片、处方或日程

### Requirement: `searchExerciseResources` observation 必须保留动态事实并压缩重复说明
系统 SHALL 在 `searchExerciseResources` 的模型 observation 中继续暴露真实 tool result 才能确定的动态事实。Observation MUST 以结构化字段表达查询事实、动作事实和 section coverage；MUST NOT 复制完整 system prompt、manifest 长段、业务输出 kind 判断、最终目标满足度判断或下一步 action 建议。

#### Scenario: Observation 不暴露输出 kind 判断
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 包含查询事实，例如 `suitabilities`、`totalMatches`、`returnedCount`、`truncated` 和 `appliedFilters`
- **AND** model observation MUST 包含 section coverage 事实，例如 `sectionSummary`、`availableSections` 和缺失 section 事实
- **AND** model observation MUST 包含有限 `groups.<section>.exercises[]` 动作事实，例如 `exerciseId` 和 `allowedSections`
- **AND** model observation MUST NOT 包含 `supportsOutputKinds`
- **AND** model observation MUST NOT 包含 `routinePlanCompositionBoundary.supportsOutputKinds`
- **AND** model observation MUST NOT 包含任何等价字段列出 `exercise_selection`、`routine` 或 `plan` 这类可输出 kind

#### Scenario: Observation 不判断可否成功交付 visibleOutputs
- **WHEN** `searchExerciseResources` 返回受约束的成功查询结果
- **THEN** model observation MAY 表达 tool 查询成功以及返回了哪些事实
- **AND** model observation MUST NOT 包含 `supportsSuccessfulVisibleOutputs`
- **AND** model observation MUST NOT 包含 `finalAnswerSupport`
- **AND** model observation MUST NOT 表达该结果能否满足用户最终训练请求
- **AND** 最终 `visibleTrainingProposal` 有效性 MUST 由 Planner 输出、output contract 和 terminal validator 决定

#### Scenario: Observation 不提供下一步 action 建议
- **WHEN** `searchExerciseResources` model observation 被构造
- **THEN** observation MUST NOT 包含 `nextActionHints`
- **AND** observation MUST NOT 指示 Planner 输出 `final_answer_with_visible_outputs`
- **AND** observation MUST NOT 指示 Planner 继续 tool calling 或询问用户
- **AND** service code MUST NOT 基于用户原始自然语言选择 action、toolName 或 `payload.kind`

#### Scenario: 结构缺口仍作为事实暴露
- **WHEN** `searchExerciseResources` result lacks one or more queried or needed sections
- **THEN** model observation MAY expose deterministic missing section facts
- **AND** model observation MAY expose `diagnostics[]` for empty groups or invalid anchors
- **AND** model observation MUST NOT convert missing section facts into forbidden output kinds, supported output kinds or fixed recovery flow

#### Scenario: observation 用短边界替代长篇终态重复
- **WHEN** `searchExerciseResources` model observation 暴露事实不足或查询过宽
- **THEN** model observation MAY 表达 `diagnostics[]`、`missingSections`、`querySpecificity` 或等价确定性事实
- **AND** model observation MUST NOT 复制 system prompt 中关于 `AgentAction`、`usedRefs`、resource id 和 final answer 终态的完整长规则

### Requirement: `searchExerciseResources` 必须提供 section-scoped 动作事实说明

系统 SHALL 在 `searchExerciseResources` 的模型可见说明、schema description、examples 或 observation 中表达 `groups.<section>.exercises[]` 是生成训练方案动作项的主要事实来源。

#### Scenario: manifest 说明 groups section 消费边界
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** 说明 MUST 表达只有 `groups.<section>.exercises[]` 中的动作才能作为 `visibleTrainingProposal.exerciseItems` 的动作来源
- **AND** 生成 `exerciseItems` 时 `section` MUST 等于使用的 groups key
- **AND** 该动作 `allowedSections` MUST 包含该 `section`
- **AND** `totalMatches = 0` 只表示查询完成，不表示可以生成训练结构

#### Scenario: examples 使用完整 tool_call action
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** examples MUST 包含完整 `{ type: "tool_call", toolName: "searchExerciseResources", input: ... }`
- **AND** examples MUST 覆盖按肌群 / 器械 / 难度查询、补齐 support sections、使用 `requiredExerciseIds` 的主要形态
- **AND** examples MUST NOT 训练模型输出裸 tool input

### Requirement: `searchExerciseResources` 必须按 section 应用 hard filter policy
系统 SHALL 让 `searchExerciseResources` 在构造数据库查询前按目标 section 选择 hard filter policy。`training` SHALL 使用严格训练动作 policy；`warmup` 和 `stretch` SHALL 使用 `support_section` policy。该 policy 选择 MUST 只基于 Planner 显式传入并通过 schema 校验的 `suitabilities`，不得基于用户原文、关键词、正则、短句模板、历史摘要、`q` 文本或查询结果是否为空。

#### Scenario: training 查询保持严格结构化过滤
- **WHEN** `searchExerciseResources` 输入包含 `suitabilities = ["training"]`
- **AND** 输入包含 `equipment`、`homeRequirement`、`muscles`、`level`、`force`、`mechanic`、`category`、`goalTag`、`riskTag`、`q`、`requiredExerciseIds` 或 `excludeExerciseIds`
- **THEN** repository MUST 按 `training` policy 将这些合法结构化字段转换为数据库可执行 hard filters
- **AND** 查询 MUST 继续在数据库层下推
- **AND** 查询 MUST NOT 回到全量动作读取后内存过滤

#### Scenario: warmup 查询使用 support section hard filters
- **WHEN** `searchExerciseResources` 输入包含 `suitabilities = ["warmup"]`
- **AND** 输入包含 `equipment = "no_equipment"`、`muscles = ["胸部"]` 和 `level = "intermediate"`
- **THEN** repository MUST 按 `support_section` policy 应用发布态、`warmup` section、器械和肌群 hard filters
- **AND** repository MUST NOT 将 `level` 作为该 `warmup` 查询的 hard filter
- **AND** tool output MUST 通过 `filterApplications` 或等价结构声明 `level` 未作为该 section 的 hard filter 使用

#### Scenario: stretch 查询使用 support section hard filters
- **WHEN** `searchExerciseResources` 输入包含 `suitabilities = ["stretch"]`
- **AND** 输入包含 `equipment`、`homeRequirement`、`muscles`、`category`、`goalTag`、`riskTag` 或 `q`
- **THEN** repository MUST 按 `support_section` policy 应用发布态、`stretch` section、器械、场地和肌群 hard filters
- **AND** repository MUST NOT 将 `category`、`goalTag`、`riskTag` 或 `q` 作为该 `stretch` 查询的 hard filters
- **AND** tool output MUST 通过 `filterApplications` 或等价结构声明这些未作为 hard filter 使用的输入字段

#### Scenario: 混合 section 查询分别记录 hardFilterPolicy
- **WHEN** `searchExerciseResources` 输入包含 `suitabilities = ["training", "warmup", "stretch"]`
- **AND** 输入包含 `equipment`、`muscles` 和 `level`
- **THEN** repository MUST 分别按 section 构造查询
- **AND** `training` 查询 MUST 应用 `level` hard filter
- **AND** `warmup` 与 `stretch` 查询 MUST NOT 应用 `level` hard filter
- **AND** output MUST 分别记录 `training`、`warmup` 和 `stretch` 的 `filterApplications`

#### Scenario: 不新增服务端语义分流
- **WHEN** `/api/chat` 或等价 production entrypoint 收到用户自然语言输入
- **THEN** route、Agent core、handler 和 repository MUST NOT 根据用户原文选择、改写或放宽 `searchExerciseResources` 的 section、器械、肌群、难度、`q` 或其他输入字段
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
- **WHEN** Planner 为 `warmup` 或 `stretch` 查询传入 `level`、`force`、`mechanic`、`category`、`goalTag`、`riskTag` 或 `q`
- **THEN** `unappliedInputFilters` MUST 为每个未应用字段包含 `field` 和稳定 `code`
- **AND** `code` MUST 使用机器可读枚举，例如 `not_applied_as_hard_filter_for_support_section`
- **AND** output MAY 包含字段值摘要 `valueSummary`
- **AND** `valueSummary` MUST 经过脱敏和截断
- **AND** model observation 和 trace summary MUST NOT 把自由文本 `q` 原文作为 `unappliedInputFilters` 值回灌
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

