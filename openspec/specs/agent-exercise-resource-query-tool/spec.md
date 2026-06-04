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

系统 SHALL 使用严格 input schema 约束 `searchExerciseResources` 入参，字段范围必须对齐当前动作列表查询和 `Exercise` 模型可确定性执行的筛选字段，并区分高层身体区域与真实肌群 facet。刷新场景 MAY 通过 `excludeExerciseIds` 排除指定发布态动作 id；点名动作已解析为数据库 id 后，MAY 通过 `requiredExerciseIds` 请求返回列表优先包含这些动作。

#### Scenario: 合法结构化查询
- **WHEN** 模型调用 `searchExerciseResources`
- **THEN** input schema MUST 只允许 `q`、`category`、`suitabilities`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`bodyRegions`、`goalTag`、`riskTag`、`published`、`sort`、`excludeExerciseIds` 和 `requiredExerciseIds`
- **AND** `suitabilities` MUST 只允许 `warmup`、`training` 或 `stretch`
- **AND** `bodyRegions` MUST 只允许 `upper_body`、`lower_body`、`core` 或 `full_body`
- **AND** `sort` MUST 只允许 `name_asc`、`name_desc`、`level_asc`、`level_desc`、`category_asc` 或 `category_desc`
- **AND** `excludeExerciseIds` MUST 是去重后的动作 id 数组，并且数量 MUST 有服务端上限
- **AND** `requiredExerciseIds` MUST 是去重后的动作 id 数组，并且数量 MUST 有服务端上限
- **AND** 缺省 `sort` MUST 为 `name_asc`
- **AND** 缺省发布态口径 MUST 为 `published = true`

#### Scenario: 高层身体区域使用 bodyRegions
- **WHEN** 用户表达“上肢”“下肢”“腿部”“核心”或“全身”等高层身体区域
- **THEN** 模型可见 schema、manifest 或 examples MUST 引导模型使用 `bodyRegions`
- **AND** 模型可见 schema、manifest 或 examples MUST NOT 要求模型把 `"腿部"`、`"下肢"`、`"upper body"`、`"lower body"` 或等价范围词写入 `muscle`

#### Scenario: muscle 只表示真实肌群 facet
- **WHEN** 模型使用 `muscle`
- **THEN** `muscle` MUST 表示动作库真实主肌群或辅助肌群 facet
- **AND** `muscle` SHOULD 使用如 `股四头肌`、`腘绳肌`、`臀部`、`小腿`、`胸部`、`肩部`、`背阔肌`、`腹肌` 等真实肌群值
- **AND** 系统 MUST NOT 根据用户原文把 `muscle` 的高层区域词服务端改写成其他语义意图

#### Scenario: 排除指定动作 id
- **WHEN** `searchExerciseResources` 收到合法 `excludeExerciseIds`
- **THEN** repository 查询 MUST 在数据库层排除这些动作 id
- **AND** 被排除动作 MUST NOT 出现在 `exercises` 输出中
- **AND** `appliedFilters` 或等价查询摘要 MUST 能记录本次存在排除条件，但不得泄漏不该展示的完整历史 payload

#### Scenario: 优先包含指定动作 id
- **WHEN** `searchExerciseResources` 收到合法 `requiredExerciseIds`
- **THEN** handler MUST 尝试将这些发布态动作优先纳入对应 `groups.<section>.exercises` 列表
- **AND** 被纳入的指定动作 MUST 使用与普通动作相同的动作摘要结构
- **AND** tool MUST NOT 为指定动作新增 `requiredMatches`、`supplementalMatches` 或其他并行顶层结果字段

#### Scenario: 拒绝消费侧和分页字段
- **WHEN** 模型调用 `searchExerciseResources` 时传入未知字段、`purpose`、`candidateUse`、`allowedExerciseIds`、`injuryLimitations`、`requiresNoEquipment`、`resultRequirements`、`rankingHints`、`limit`、`offset`、`page` 或 `pageSize`
- **THEN** input schema MUST 在 handler 执行前拒绝该调用
- **AND** Runtime MUST 按结构化非法输入或 repair 边界处理
- **AND** 服务端 MUST NOT 根据用户原文把这些字段改写成其他业务意图

### Requirement: `searchExerciseResources` 必须返回查询摘要和动作资源摘要
系统 SHALL 让 `searchExerciseResources` 返回稳定的成功 output，包含实际查询口径、命中数量、截断状态、区域展开摘要和有限动作资源摘要。

#### Scenario: 查询成功并返回动作
- **WHEN** `searchExerciseResources` 使用合法输入完成数据库查询
- **THEN** output MUST 包含 `status: "succeeded"`
- **AND** output MUST 包含 `query.sort`、`query.published`、`query.appliedFilters`、`query.totalMatches`、`query.returnedCount`、`query.maxReturned` 和 `query.truncated`
- **AND** 当输入包含 `bodyRegions` 时，output MUST 包含本次结构化区域和展开后的真实肌群摘要
- **AND** output MUST 包含 `exercises`
- **AND** 每个动作摘要 MUST 至少包含 `id`、`nameZh`、`nameEn`、器械、居家条件、主肌群、辅助肌群、`allowedSections`、`goalTags`、`riskTags`、图片 URL 和发布态摘要字段

#### Scenario: 具体筛选查询命中为空
- **WHEN** `searchExerciseResources` 的合法查询得到 `totalMatches = 0`
- **AND** 输入包含 `bodyRegions`、`muscle`、`equipment`、`category`、`suitability`、`level`、`goalTag`、`riskTag`、`homeRequirement`、`force` 或 `mechanic` 等具体筛选条件
- **THEN** 工具 MUST 返回成功 output
- **AND** fulfillment MUST 表示 `satisfied = false`
- **AND** fulfillment summary MUST 说明查询已执行但没有满足当前筛选条件的动作
- **AND** 模型 MUST NOT 将该 tool result 当作成功动作推荐结果
- **AND** 模型 MAY 基于该 tool result 解释当前筛选未命中、发起澄清或在下一轮使用更合适的结构化字段重查

### Requirement: `searchExerciseResources` 必须下推数据库查询且不得全表读取
系统 SHALL 为 `searchExerciseResources` 使用专用动作资源查询 repository，在数据库层执行发布态、结构化字段、`bodyRegions` 展开后的真实肌群和排除条件筛选，并避免每次 tool 调用读取全量 `Exercise` 数据后再内存过滤。

#### Scenario: Repository 查询下推结构化筛选
- **WHEN** `searchExerciseResources` handler 接收到合法结构化输入
- **THEN** handler MUST 调用专用 repository 查询入口，而不是调用 `listExerciseRecords()`、`listAllExercises()`、旧 `searchExercises()` 或其他全量动作读取入口
- **AND** repository MUST 将 `published`、`category`、`suitability`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`bodyRegions`、`goalTag`、`riskTag`、`q` 和 `excludeExerciseIds` 转换为数据库可执行 `where` 条件
- **AND** repository MUST 只根据结构化 `bodyRegions` 枚举展开真实肌群 facet
- **AND** repository MUST 使用同一 `where` 执行 `count()` 来生成 `totalMatches`
- **AND** repository MUST 使用服务端内部固定 `maxReturned` 执行 `findMany({ take: maxReturned + 1 })` 或等价查询来判断 `truncated`
- **AND** `maxReturned`、`take`、`offset`、`page` 或 `pageSize` MUST NOT 由 LLM 输入控制

#### Scenario: 排除后候选不足
- **WHEN** 合法查询在应用 `excludeExerciseIds` 后返回 0 个或不足以形成有用回答的动作
- **THEN** tool result MUST 使用结构化摘要表达 `totalMatches`、`returnedCount`、`excludedCount` 或等价候选不足信息
- **AND** 模型 MAY 基于该结果解释当前条件下没有更多未展示动作，或向用户澄清是否放宽条件
- **AND** 系统 MUST NOT 回填已被排除的用户已看到动作来假装刷新成功

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
系统 SHALL 在 tool manifest、schema 描述、examples 或 observation 中为模型提供 `searchExerciseResources` 的使用边界，且不得把该 tool 的业务特例写入通用 Agent prompt。该边界 SHALL 表达 tool 提供发布态动作事实原料，而不是最终训练方案生成器。

#### Scenario: Manifest 说明何时使用和何时不用
- **WHEN** Agent 构造 Planner 可见 tool manifest
- **THEN** `searchExerciseResources` 的模型可见说明 MUST 表达它适用于查询符合结构化条件的发布态动作列表
- **AND** 模型可见说明 MUST 表达高层身体区域应使用 `bodyRegions`
- **AND** 模型可见说明 MUST 表达 `muscle` 只用于动作库真实主肌群或辅助肌群 facet
- **AND** 模型可见说明 MUST 表达 `excludeExerciseIds` 只用于排除用户已看到或用户明确要求排除的动作 id
- **AND** 模型可见说明 MUST 表达“再推荐一批 / 换一批”应尽量基于当前 run 已恢复的用户可见动作事实填充排除 id
- **AND** 模型可见说明 MUST 表达未展示给用户的内部候选或未读取完整事实不得被默认排除
- **AND** 模型可见说明 MUST 表达该 tool 返回的 `groups.<section>.exercises[*].exerciseId` 在 `fulfillment.satisfied = true` 时可作为 `visibleTrainingProposal.exerciseItems[*].exerciseId` 的受控动作事实来源
- **AND** 模型可见说明 MUST 表达该 tool 本身不生成最终 `visibleTrainingProposal`、`routine`、`plan`、`patch`、`prescription`、`schedule`、训练卡片、保存结果或用户记忆
- **AND** 模型可见说明 MUST 表达最终训练输出只能由 `final_answer.visibleOutputs[]` 承载
- **AND** 模型可见说明 MUST 表达 failed、非法输入或 `satisfied=false` 结果不能支撑成功动作推荐或训练方案
- **AND** 模型可见说明 MUST NOT 把自然语言短语写成固定 `payload.kind` 选择规则
- **AND** 模型可见说明 MUST NOT 要求固定 tool 调用次数或固定 tool 调用顺序
- **AND** 通用 Agent prompt MUST NOT 新增 `searchExerciseResources` toolName 特例或服务端关键词路由规则

### Requirement: `searchExerciseResources` 必须具备 tool-level 验证
系统 SHALL 为 `searchExerciseResources` 提供直接覆盖真实 tool 执行入口的自动化测试，而不能只验证 registry 或 manifest 暴露。

#### Scenario: Tool 单测覆盖业务行为和安全边界
- **WHEN** 本 change 完成实现
- **THEN** 自动化测试 MUST 直接覆盖 `searchExerciseResources` 的 handler、`executeTool` 或当前真实 runtime 执行入口
- **AND** 测试 MUST 覆盖 `bodyRegions=["lower_body"]` 能返回真实下肢动作
- **AND** 测试 MUST 覆盖 `muscle="腿部"` 这种未知精确 facet 的空结果不会被标记为 `satisfied=true`
- **AND** 测试 MUST 覆盖成功路径、schema 拒绝、发布态默认值、`published = false` 拒绝、空结果、数据库下推查询、projection / redaction、trace summary、handler 失败归一化、`excludeExerciseIds` 去重、数量上限、非法 id 拒绝、数据库层排除、排除后候选不足和摘要投影
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

