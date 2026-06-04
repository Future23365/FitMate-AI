## MODIFIED Requirements

### Requirement: `searchExerciseResources` 输入必须只包含动作列表结构化筛选字段

系统 SHALL 使用严格 input schema 约束 `searchExerciseResources` 入参，字段范围必须对齐当前发布态 `Exercise` 数据库可确定性执行的筛选字段。系统 MUST 删除 `bodyRegions`，不得再使用高层身体区域 enum 或服务端区域展开替代模型对真实数据库 facet 的选择。刷新场景 MAY 通过 `excludeExerciseIds` 排除指定发布态动作 id；点名动作已解析为数据库 id 后，MAY 通过 `requiredExerciseIds` 请求返回列表优先包含这些动作。

#### Scenario: 合法结构化查询
- **WHEN** 模型调用 `searchExerciseResources`
- **THEN** input schema MUST 只允许 `q`、`category`、`suitabilities`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`muscles`、`goalTag`、`riskTag`、`published`、`sort`、`excludeExerciseIds` 和 `requiredExerciseIds`
- **AND** `bodyRegions` MUST NOT 出现在 input schema、examples 或合法 input 中
- **AND** `suitabilities` MUST 只允许 `warmup`、`training` 或 `stretch`
- **AND** `sort` MUST 只允许 `name_asc`、`name_desc`、`level_asc`、`level_desc`、`category_asc` 或 `category_desc`
- **AND** `excludeExerciseIds` MUST 是去重后的动作 id 数组，并且数量 MUST 有服务端上限
- **AND** `requiredExerciseIds` MUST 是去重后的动作 id 数组，并且数量 MUST 有服务端上限
- **AND** 缺省 `sort` MUST 为 `name_asc`
- **AND** 缺省发布态口径 MUST 为 `published = true`

#### Scenario: 删除 bodyRegions 高层区域查询
- **WHEN** 模型调用 `searchExerciseResources` 时传入 `bodyRegions`
- **THEN** input schema MUST 在 handler 执行前拒绝该调用
- **AND** Runtime MUST 按结构化非法输入或 repair 边界处理
- **AND** repository MUST NOT 根据 `upper_body`、`lower_body`、`core`、`full_body` 或等价高层区域展开肌群
- **AND** 服务端 MUST NOT 根据用户原文把“上肢”“下肢”“腿部”“核心”“全身”等自然语言区域改写成数据库 facet

#### Scenario: muscle 和 muscles 只表示真实肌群 facet
- **WHEN** 模型使用 `muscle`
- **THEN** `muscle` MUST 表示动作库真实主肌群或辅助肌群 facet
- **AND** `muscle` SHOULD 使用 `facetCatalog.muscles` 中真实出现的值
- **WHEN** 模型使用 `muscles`
- **THEN** `muscles` MUST 是动作库真实主肌群或辅助肌群 facet 数组
- **AND** `muscles` SHOULD 使用 `facetCatalog.muscles` 中真实出现的值
- **AND** 服务端 MUST 只对 `muscle` 与 `muscles` 做去空、去重、schema 校验和数据库 OR 查询
- **AND** 服务端 MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板增删肌群

#### Scenario: 其他筛选字段必须来自 facetCatalog
- **WHEN** 模型使用 `category`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`goalTag` 或 `riskTag`
- **THEN** 模型可见合同 MUST 引导模型优先使用 `facetCatalog` 中对应字段的真实值
- **AND** 服务端 MUST 只执行 schema 允许且数据库可查询的结构化字段
- **AND** 服务端 MUST NOT 将自然语言目标、训练目的或用户限制通过关键词规则改写成这些字段

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

#### Scenario: 拒绝消费侧、分页和旧区域字段
- **WHEN** 模型调用 `searchExerciseResources` 时传入未知字段、`bodyRegions`、`purpose`、`candidateUse`、`allowedExerciseIds`、`injuryLimitations`、`requiresNoEquipment`、`resultRequirements`、`rankingHints`、`limit`、`offset`、`page` 或 `pageSize`
- **THEN** input schema MUST 在 handler 执行前拒绝该调用
- **AND** Runtime MUST 按结构化非法输入或 repair 边界处理
- **AND** 服务端 MUST NOT 根据用户原文把这些字段改写成其他业务意图

### Requirement: `searchExerciseResources` 必须返回查询摘要和动作资源摘要

系统 SHALL 让 `searchExerciseResources` 返回稳定的成功 output，包含实际查询口径、命中数量、截断状态、应用的数据库 facet 摘要和有限动作资源摘要。Output MUST NOT 暴露 `bodyRegions` 或服务端区域展开结果。

#### Scenario: 查询成功并返回动作
- **WHEN** `searchExerciseResources` 使用合法输入完成数据库查询
- **THEN** output MUST 包含 `status: "succeeded"`
- **AND** output MUST 包含 `query.sort`、`query.published`、`query.appliedFilters`、`query.totalMatches`、`query.returnedCount`、`query.maxReturned` 和 `query.truncated`
- **AND** 当输入包含 `muscle` 或 `muscles` 时，output MUST 包含实际应用的真实肌群 facet 摘要
- **AND** output MUST NOT 包含 `bodyRegions` 或 `expandedMuscles`
- **AND** output MUST 包含 `exercises`
- **AND** 每个动作摘要 MUST 至少包含 `id`、`nameZh`、`nameEn`、器械、居家条件、主肌群、辅助肌群、`allowedSections`、`goalTags`、`riskTags`、图片 URL 和发布态摘要字段

#### Scenario: 具体筛选查询命中为空
- **WHEN** `searchExerciseResources` 的合法查询得到 `totalMatches = 0`
- **AND** 输入包含 `muscle`、`muscles`、`equipment`、`category`、`suitabilities`、`level`、`goalTag`、`riskTag`、`homeRequirement`、`force` 或 `mechanic` 等具体筛选条件
- **THEN** 工具 MUST 返回成功 output
- **AND** fulfillment MUST 表示查询事实已完成
- **AND** fulfillment summary MUST 说明查询已执行但没有满足当前筛选条件的动作
- **AND** 模型 MUST NOT 将该 tool result 当作成功动作推荐候选集合
- **AND** 模型 MAY 基于该 tool result 解释当前筛选未命中、发起澄清或在下一轮使用其他 `facetCatalog` 值重查

### Requirement: `searchExerciseResources` 必须下推数据库查询且不得全表读取

系统 SHALL 为 `searchExerciseResources` 使用专用动作资源查询 repository，在数据库层执行发布态、结构化数据库 facet 和排除条件筛选，并避免每次 tool 调用读取全量 `Exercise` 数据后再内存过滤。Repository MUST NOT 使用 `bodyRegions` 或服务端区域展开构造查询。

#### Scenario: Repository 查询下推结构化筛选
- **WHEN** `searchExerciseResources` handler 接收到合法结构化输入
- **THEN** handler MUST 调用专用 repository 查询入口，而不是调用 `listExerciseRecords()`、`listAllExercises()`、旧 `searchExercises()` 或其他全量动作读取入口
- **AND** repository MUST 将 `published`、`category`、`suitabilities`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`muscles`、`goalTag`、`riskTag`、`q`、`requiredExerciseIds` 和 `excludeExerciseIds` 转换为数据库可执行 `where` 条件
- **AND** repository MUST 将 `muscle` 与 `muscles` 合并去重后，在 `primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles` 和 `secondaryMusclesZh` 中执行 OR 查询
- **AND** repository MUST NOT 引用 `bodyRegions`、`expandExerciseBodyRegionTargetMuscles` 或等价区域展开逻辑
- **AND** repository MUST 使用同一 `where` 执行 `count()` 来生成 `totalMatches`
- **AND** repository MUST 使用服务端内部固定 `maxReturned` 执行 `findMany({ take: maxReturned + 1 })` 或等价查询来判断 `truncated`
- **AND** `maxReturned`、`take`、`offset`、`page` 或 `pageSize` MUST NOT 由 LLM 输入控制

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

## ADDED Requirements

### Requirement: `searchExerciseResources` 必须向 Planner 暴露完整数据库 facetCatalog

系统 SHALL 将当前发布态动作库中 `searchExerciseResources` 支持查询的全部数据库 facet 作为模型可见 `facetCatalog` 暴露给 Planner。`facetCatalog` MUST 来自当前数据库事实或同一生产事实源，MUST 去重、过滤空值并使用确定性排序；系统 MUST NOT 用手写静态 facet 表替代数据库事实，MUST NOT 因集合大小裁剪任何支持查询的 facet 类别。

#### Scenario: facetCatalog 包含全部支持查询的数据库 facet
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

#### Scenario: facetCatalog 来自发布态数据库事实
- **WHEN** 数据库发布态 `Exercise` 中新增、删除或修改某个支持查询的 facet 值
- **THEN** 下一次 production registry 或 model input 构造 MUST 使用更新后的 facet 值
- **AND** `facetCatalog` MUST 只过滤空值和重复值
- **AND** `facetCatalog` MUST NOT 因 prompt token、集合大小或手写优先级隐藏某个支持查询的 facet 类别
- **AND** `facetCatalog` MAY 包含 `facetCatalogHash`、`source`、`publishedOnly` 或 `generatedAt` 等诊断字段，但这些字段 MUST NOT 替代完整 facet 列表

#### Scenario: facetCatalog 不表达自然语言语义映射
- **WHEN** `facetCatalog` 暴露给 Planner
- **THEN** `facetCatalog` MUST 只表达数据库当前支持的可执行 facet 值
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
