## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: `searchExerciseResources` 输入必须只包含动作列表结构化筛选字段
系统 SHALL 将 `searchExerciseResources` 的输入限制为结构化动作列表筛选字段和受控候选数量字段。允许字段包括 `exerciseNames`、`category`、`suitabilities`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscles`、`goalTag`、`riskTag`、`excludeExerciseIds`、`requiredExerciseIds`、`candidateCountPerSection` 和 `sort`。系统 MUST NOT 暴露 `q`、`published`、`visibility`、`bodyRegions`、`intensity`、`userText`、`intent`、`semanticQuery`、`limit`、`page`、`pageSize`、`offset`、`take`、`cursor`、`maxReturned` 或任意 SQL / Prisma 查询片段作为模型可见输入。

#### Scenario: 合法结构化字段
- **WHEN** production registry 序列化 `searchExerciseResources` input schema
- **THEN** schema MUST 只暴露 `exerciseNames`、`category`、`suitabilities`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscles`、`goalTag`、`riskTag`、`excludeExerciseIds`、`requiredExerciseIds`、`candidateCountPerSection` 和 `sort`
- **AND** `candidateCountPerSection` MUST 表达每个请求 section 最多返回多少个动作候选
- **AND** `candidateCountPerSection` MUST NOT 被描述为分页、offset、cursor、最终展示数量承诺或全库读取能力

#### Scenario: 非法输入字段
- **WHEN** Planner 传入 `q`、`published`、`visibility`、`bodyRegions`、`intensity`、`userText`、`intent`、`semanticQuery`、`limit`、`page`、`pageSize`、`offset`、`take`、`cursor`、`maxReturned` 或任意 SQL / Prisma 查询片段
- **THEN** `searchExerciseResources` input validation MUST reject 该调用
- **AND** handler MUST NOT 执行动作库查询

### Requirement: `searchExerciseResources` 必须返回查询摘要和动作资源摘要
系统 SHALL 在 `searchExerciseResources` 成功执行后返回动作资源查询摘要和有限动作摘要。模型可见 observation MUST 使用顶层 `exercises[]` 表达当前查询口径下返回的动作候选；每个动作摘要 MUST 至少包含 `exerciseId`、`nameZh`、`nameEn`、器械、居家条件、主要肌群和图片 URL 等动作事实摘要字段。模型可见 observation MUST NOT 暴露 `allowedSections`、`sectionSummary`、`availableSections`、`missingSections`、`allowedSectionsRelation` 或 `groupSemantics`。

#### Scenario: 成功返回有限动作摘要
- **WHEN** `searchExerciseResources` 成功查询到动作候选
- **THEN** model observation MUST 包含顶层 `exercises[]`
- **AND** `exercises[]` 中每个动作 MUST 包含有限动作事实摘要
- **AND** model observation MUST 包含 `query.suitabilities`、`returnedCount`、`truncated`、`appliedFilters` 和必要 diagnostics
- **AND** model observation MUST NOT 包含完整数据库对象、完整 handler output、内部 service 对象、训练候选 evidence 或与本次查询无关的诊断 payload

#### Scenario: 不向模型暴露 placement 字段
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation 中的每个动作摘要 MUST NOT 包含 `allowedSections`
- **AND** model observation MUST NOT 包含 `sectionSummary`、`availableSections`、`missingSections` 或 `allowedSectionsRelation`
- **AND** trace / user projection MAY 保留服务端复盘需要的安全摘要，但不得把这些字段回灌为 Planner 下一轮可复制 input

### Requirement: `searchExerciseResources` 必须下推数据库查询且不得全表读取
系统 SHALL 为 `searchExerciseResources` 使用专用动作资源查询 repository，在数据库层执行动作名称匹配、结构化数据库 facet、tool 合同层确定性映射、section-aware hard filter policy、受控候选数量和排除条件筛选，并避免每次 tool 调用读取全量 `Exercise` 数据后再内存过滤。Repository MUST NOT 使用 `q`、`bodyRegions` 或服务端区域展开构造查询。Repository MUST NOT 从 Planner input 读取 `published`，也 MUST NOT 把 `published` 作为模型可控 hard filter。

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
- **AND** repository MUST 使用 `candidateCountPerSection` 或默认候选数量推导的服务端受控 `maxReturned` 执行 `findMany({ take: maxReturned + 1 })` 或等价查询来判断 `truncated`
- **AND** `limit`、`take`、`offset`、`page`、`pageSize`、`cursor` 或 `maxReturned` MUST NOT 由 LLM 输入控制

#### Scenario: 显式环境条件叠加过滤
- **WHEN** `searchExerciseResources` 输入同时包含 `equipment = "no_equipment"` 和合法 `homeRequirement`
- **THEN** repository MUST 同时应用自重动作查询条件和该环境条件
- **AND** 该环境条件 MUST 来自 Planner 显式输入
- **AND** repository MUST NOT 根据用户原文或 `equipment` 值自动选择 `floor`、`support`、`none` 或其他环境条件

### Requirement: `searchExerciseResources` 投影必须保护模型、用户和 trace 边界
系统 SHALL 为 `searchExerciseResources` 提供安全模型观察、用户投影和 trace summary，避免完整 handler output 默认外泄。模型可见 observation MUST 只表达动作库查询事实、有限动作摘要、查询口径、受控候选数量、截断状态和确定性 diagnostics；MUST NOT 暴露业务目标满足度、section coverage 缺口、每个动作的 placement eligibility、最终交付指令、下一步 tool 调用指导或固定 workflow。

#### Scenario: 模型观察只包含安全事实摘要
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** 模型可见 observation MUST 包含查询事实，例如 `query`、`filters`、`returnedCount`、`truncated` 和应用的数据库 facet 摘要
- **AND** 模型可见 observation MUST 包含顶层 `exercises[]`
- **AND** 模型可见 observation MUST 只包含有限动作摘要字段，例如 `exerciseId`、`nameZh`、`nameEn`、`equipmentZh`、`homeRequirementZh`、`primaryMusclesZh` 和 `imageUrl`
- **AND** 模型可见 observation MUST NOT 包含 `allowedSections`、`sectionSummary`、`availableSections`、`missingSections`、`allowedSectionsRelation`、`groupSemantics`、完整数据库对象、完整 handler output、内部 service 对象、训练候选 evidence 或与本次查询无关的诊断 payload
- **AND** 模型可见 observation MUST NOT 包含 `fulfillment`、`satisfied`、`supportsOutputKinds`、`visibleDeliveryBoundary`、`supportSectionCompletionBoundary`、`routinePlanCompositionBoundary` 或等价字段

#### Scenario: 用户投影不生成训练卡片
- **WHEN** Response Renderer 或等价用户投影处理 `searchExerciseResources` 结果
- **THEN** 用户可见投影 MUST 只表达查询口径、命中数量、截断状态和可展示动作摘要
- **AND** 用户可见投影 MUST NOT 生成 `visibleTrainingProposal`、routine、plan、处方、日程或训练卡片事实

### Requirement: `searchExerciseResources` 模型可见说明必须表达业务边界
系统 SHALL 在 tool manifest、schema 描述、examples、facet catalog 或 observation 中为模型提供 `searchExerciseResources` 的使用边界，且不得把该 tool 的业务特例写入通用 Agent prompt。该边界 SHALL 表达 tool 只接受数据库真实 facet、受控动作 id、受控动作名称和受控候选数量；高层自然语言目标由模型基于 `facetCatalog`、上下文和可见事实自主选择结构化字段。该边界 MUST NOT 表达业务目标满足度，也 MUST NOT 将查询结果包装成结构化训练交付流程或 section placement 建议。

#### Scenario: Manifest 说明何时使用和何时不用
- **WHEN** Agent 构造 Planner 可见 tool manifest
- **THEN** `searchExerciseResources` 的模型可见说明 MUST 表达它适用于查询符合结构化数据库 facet 的发布态动作列表
- **AND** 模型可见说明 MUST 表达所有 facet 值应优先来自 `facetCatalog`
- **AND** 模型可见说明 MUST 表达 `candidateCountPerSection` 只控制每个请求 section 的候选数量，不是分页、offset、cursor 或最终展示数量承诺
- **AND** 模型可见说明 MUST 表达它不适用于生成训练、保存结果、读取单个动作完整详情、从完整自然语言中做服务端语义解析、替模型做唯一身份强决策、统计全库 facet 或构建 routine / plan / patch 候选集合
- **AND** 模型可见说明 MUST NOT 表达成功结果通过 `satisfied=true`、`fulfillment.satisfied=true` 或等价业务目标满足度支撑普通回答
- **AND** 模型可见说明 MUST NOT 表达 failed、非法输入、0 条结果或候选不足通过 `satisfied=false`、`fulfillment.satisfied=false` 或等价业务目标未满足字段进入下一步
- **AND** 模型可见说明 MUST NOT 表达 `supportsOutputKinds`、`supportsSuccessfulVisibleOutputs`、`finalAnswerSupport` 或等价业务输出可行性判断
- **AND** 模型可见说明 MUST NOT 把自然语言短语写成固定 facet 选择规则
- **AND** 通用 Agent prompt MUST NOT 新增 `searchExerciseResources` toolName 特例或服务端关键词路由规则

#### Scenario: 查询结果事实可用于模型自主推理
- **WHEN** `searchExerciseResources` 返回动作列表、空列表或部分候选
- **THEN** 模型可见说明 MUST 表达该结果是当前查询口径下的数据库动作候选事实
- **AND** 模型可见说明 MUST 表达 `exercises[]` 中的动作来自本次 `suitabilities` 查询口径
- **AND** 模型可见说明 MUST NOT 表达缺少某 section 时模型必须继续调用 `searchExerciseResources`
- **AND** 模型可见说明 MUST NOT 表达若要交付用户可见结果就必须继续调用 `submitVisibleTrainingProposal`

### Requirement: searchExerciseResources 模型可见合同必须表达 section coverage 与结构化输出边界
`searchExerciseResources` 的模型可见 manifest、schema description、examples 和 observation SHALL 表达模型可以通过 `suitabilities` 查询 `warmup`、`training` 或 `stretch` 候选，但模型可见 observation MUST NOT 暴露 section coverage 缺口或每个动作的 placement eligibility。是否需要完整 routine / plan 的 section 结构由模型根据用户目标自主判断，并由最终服务端 validator 复核结构化输出。

#### Scenario: Manifest 表达 section 查询方式
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** manifest MUST 说明 `searchExerciseResources` 可以按 `suitabilities = ["warmup"]`、`["training"]` 或 `["stretch"]` 查询对应用途的动作候选
- **AND** manifest MUST 说明 `suitabilities` 是查询口径，不是最终训练编排命令
- **AND** manifest MUST NOT 说明缺失 section 时必须先调用某个固定 tool、必须补查某个固定 section 或必须提交某个固定终态
- **AND** manifest MUST 使用中文描述业务含义，`searchExerciseResources`、`suitabilities`、`warmup`、`training`、`stretch`、`routine`、`plan`、`visibleTrainingProposal` 保持英文原样

#### Scenario: Observation 不表达 section coverage
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 表达本次查询使用的 `suitabilities`
- **AND** model observation MUST NOT 表达 `availableSections`
- **AND** model observation MUST NOT 表达 `sectionSummary`
- **AND** model observation MUST NOT 表达 `missingSections`
- **AND** model observation MUST NOT 将 section 查询口径表达成固定下一步 tool 调用、固定补查顺序或最终输出禁令全集

### Requirement: `searchExerciseResources` observation 必须保留动态事实并压缩重复说明
系统 SHALL 在 `searchExerciseResources` 的模型 observation 中继续暴露真实 tool result 才能确定的动态事实。Observation MUST 以结构化字段表达查询事实、动作候选事实、候选数量和 diagnostics；MUST NOT 复制完整 system prompt、manifest 长段、业务输出 kind 判断、section coverage 缺口、动作 placement eligibility、最终目标满足度判断或下一步 action 建议。

#### Scenario: Observation 不暴露输出 kind 判断
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 包含查询事实，例如 `suitabilities`、`returnedCount`、`truncated` 和 `appliedFilters`
- **AND** model observation MUST 包含顶层 `exercises[]` 动作候选事实，例如 `exerciseId`、`nameZh`、`nameEn`、`equipmentZh`、`homeRequirementZh`、`primaryMusclesZh` 和 `imageUrl`
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

### Requirement: `searchExerciseResources` 多肌群查询必须均衡返回候选
系统 SHALL 让 `searchExerciseResources` 的多 `muscles` 查询返回代表性候选覆盖，而不是只按默认排序取前 N 个。多肌群查询 MUST 在当前 section、当前过滤条件和当前候选数量上限内尽量均衡覆盖请求肌群；没有匹配的肌群只进入诊断事实，不得被解释为必须继续补查或用户目标失败。

#### Scenario: 多肌群 training 查询均衡返回候选
- **WHEN** 模型调用 `searchExerciseResources`，输入包含 `suitabilities = ["training"]`
- **AND** 输入包含多个合法 `muscles`
- **AND** 当前过滤条件下至少两个请求肌群存在匹配候选
- **THEN** `exercises[]` MUST 尽量包含多个请求肌群的候选动作
- **AND** 系统 MUST NOT 只因默认 `name_asc` 排序而让返回候选集中在单一请求肌群
- **AND** 返回候选 MUST 继续满足 section hard filter、`level`、`equipment`、`homeRequirement`、`category`、`goalTag`、`riskTag`、`requiredExerciseIds` 和 `excludeExerciseIds` 等既有筛选合同

#### Scenario: 候选数量受上限约束
- **WHEN** 多肌群查询命中候选数量超过 `candidateCountPerSection` 或默认候选数量
- **THEN** `returnedCount` MUST 不超过该受控候选数量
- **AND** `truncated` MUST 表达是否仍存在未返回候选
- **AND** 模型 MUST NOT 能通过 `limit`、`offset`、`page`、`pageSize`、`take`、`cursor`、`maxReturned` 或等价字段控制返回数量

#### Scenario: requiredExerciseIds 优先于均衡填充
- **WHEN** 输入同时包含多个 `muscles` 和合法 `requiredExerciseIds`
- **THEN** `searchExerciseResources` MUST 继续把 `requiredExerciseIds` 作为正向锚点处理
- **AND** 可纳入当前查询口径的 required 动作 MUST 优先进入 `exercises[]`
- **AND** 均衡候选选择 MUST 只用于填充剩余名额
- **AND** required 动作无法纳入时 MUST 继续产生既有 required diagnostics

## REMOVED Requirements

### Requirement: `searchExerciseResources` 模型可见说明必须表达 group 与 section 的对应关系
**Reason**: 本 change 将模型可见 observation 从 `groups.<section>.exercises[]` 简化为顶层 `exercises[]`，不再让 query tool 向模型表达动作 placement 或 section 对应关系。

**Migration**: 模型需要某类用途候选时通过 `suitabilities` 查询；最终结构化输出继续由 `submitVisibleTrainingProposal` 和服务端 validator 基于数据库动作事实复核。

### Requirement: `searchExerciseResources` model observation 必须包含短 `groupSemantics`
**Reason**: `groupSemantics` 当前主要解释 `groups.<section>`、`allowedSectionsRelation` 和 section 组合边界；这些说明会把动作候选查询结果包装成编排诊断。

**Migration**: 删除 `groupSemantics`，保留 `query.suitabilities`、`exercises[]`、`returnedCount`、`truncated`、`appliedFilters` 和 diagnostics 作为模型可见动作事实。

### Requirement: `searchExerciseResources` observation 必须表达 section-scoped 动作事实边界
**Reason**: section-scoped observation 会继续把当前查询结果表达成结构化训练阶段事实来源，不符合本 change 将 query tool 收敛为动作候选列表的目标。

**Migration**: 使用 `exercises[]` 表达当前 `suitabilities` 查询口径下的动作候选；完整 routine / plan section 合法性由最终 validator 复核。

### Requirement: `searchExerciseResources` 必须提供 section-scoped 动作事实说明
**Reason**: 本 change 不再要求 `searchExerciseResources` 的模型可见说明表达 `groups.<section>` 或 `allowedSections` 对应关系。

**Migration**: tool description 只说明 `suitabilities` 是查询口径，model observation 只返回动作候选事实。
