## MODIFIED Requirements

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
