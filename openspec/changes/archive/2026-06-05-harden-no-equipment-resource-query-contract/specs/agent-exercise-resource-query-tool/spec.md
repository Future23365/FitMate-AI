## MODIFIED Requirements

### Requirement: `searchExerciseResources` 输入必须只包含动作列表结构化筛选字段

系统 SHALL 使用严格 input schema 约束 `searchExerciseResources` 入参，字段范围必须对齐当前发布态 `Exercise` 数据库可确定性执行的筛选字段和 tool 合同层定义的稳定查询语义。系统 MUST 删除 `bodyRegions`，不得再使用高层身体区域 enum 或服务端区域展开替代模型对真实数据库 facet 的选择。刷新场景 MAY 通过 `excludeExerciseIds` 排除指定发布态动作 id；点名动作已解析为数据库 id 后，MAY 通过 `requiredExerciseIds` 请求返回列表优先包含这些动作。

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

#### Scenario: equipment 表达器械可用性
- **WHEN** 模型使用 `equipment`
- **THEN** `equipment` MUST 表示器械可用性或器械类别筛选
- **AND** 模型可见合同 MUST 支持 `equipment = "no_equipment"` 或 `equipment = "无器械"` 表达不需要外部器械的动作查询
- **AND** `equipment = "no_equipment"` 或 `equipment = "无器械"` MUST 由服务端确定性映射到数据库自重动作事实
- **AND** 该映射 MUST NOT 默认附加 `homeRequirement = "none"` 或 `"无器械"`

#### Scenario: homeRequirement 只表达环境条件
- **WHEN** 模型使用 `homeRequirement`
- **THEN** `homeRequirement` MUST 表示环境、场地或支撑条件
- **AND** `homeRequirement` 的模型可见 catalog、schema description 和 examples MUST NOT 包含 `none` 或 `无器械`
- **AND** `homeRequirement` MUST NOT 用于表达不需要器械
- **AND** 服务端 MUST NOT 将 `homeRequirement = "none"` 或 `"无器械"` 自动迁移成 `equipment = "no_equipment"`

#### Scenario: 其他筛选字段必须来自 facetCatalog
- **WHEN** 模型使用 `category`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`goalTag` 或 `riskTag`
- **THEN** 模型可见合同 MUST 引导模型优先使用 `facetCatalog` 中对应字段的可执行值
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

### Requirement: `searchExerciseResources` 必须下推数据库查询且不得全表读取

系统 SHALL 为 `searchExerciseResources` 使用专用动作资源查询 repository，在数据库层执行发布态、结构化数据库 facet、tool 合同层确定性映射和排除条件筛选，并避免每次 tool 调用读取全量 `Exercise` 数据后再内存过滤。Repository MUST NOT 使用 `bodyRegions` 或服务端区域展开构造查询。

#### Scenario: Repository 查询下推结构化筛选
- **WHEN** `searchExerciseResources` handler 接收到合法结构化输入
- **THEN** handler MUST 调用专用 repository 查询入口，而不是调用 `listExerciseRecords()`、`listAllExercises()`、旧 `searchExercises()` 或其他全量动作读取入口
- **AND** repository MUST 将 `published`、`category`、`suitabilities`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`muscles`、`goalTag`、`riskTag`、`q`、`requiredExerciseIds` 和 `excludeExerciseIds` 转换为数据库可执行 `where` 条件
- **AND** repository MUST 将 `equipment = "no_equipment"` 或 `"无器械"` 映射为数据库自重动作查询条件，例如 `equipment = "body only"` 或 `equipmentZh = "自重"`
- **AND** repository MUST NOT 因 `equipment = "no_equipment"` 或 `"无器械"` 自动添加 `homeRequirement = "none"`、`homeRequirementZh = "无器械"` 或等价居家条件过滤
- **AND** repository MUST 将 `muscle` 与 `muscles` 合并去重后，在 `primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles` 和 `secondaryMusclesZh` 中执行 OR 查询
- **AND** repository MUST NOT 引用 `bodyRegions`、`expandExerciseBodyRegionTargetMuscles` 或等价区域展开逻辑
- **AND** repository MUST 使用同一 `where` 执行 `count()` 来生成 `totalMatches`
- **AND** repository MUST 使用服务端内部固定 `maxReturned` 执行 `findMany({ take: maxReturned + 1 })` 或等价查询来判断 `truncated`
- **AND** `maxReturned`、`take`、`offset`、`page` 或 `pageSize` MUST NOT 由 LLM 输入控制

#### Scenario: 显式环境条件叠加过滤
- **WHEN** `searchExerciseResources` 输入同时包含 `equipment = "no_equipment"` 和合法 `homeRequirement`
- **THEN** repository MUST 同时应用自重动作查询条件和该环境条件
- **AND** 该环境条件 MUST 来自 Planner 显式输入
- **AND** repository MUST NOT 根据用户原文或 `equipment` 值自动选择 `floor`、`support`、`none` 或其他环境条件

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

## ADDED Requirements

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
