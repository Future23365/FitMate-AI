## MODIFIED Requirements

### Requirement: `searchExerciseResources` 输入必须只包含动作列表结构化筛选字段

系统 SHALL 使用严格 input schema 约束 `searchExerciseResources` 入参，字段范围必须对齐当前发布态 `Exercise` 数据库可确定性执行的筛选字段和 tool 合同层定义的稳定查询语义。系统 MUST 删除 `bodyRegions`，不得再使用高层身体区域 enum 或服务端区域展开替代模型对真实数据库 facet 的选择。刷新场景 MAY 通过 `excludeExerciseIds` 排除指定发布态动作 id；点名动作已解析为数据库 id 后，MAY 通过 `requiredExerciseIds` 请求返回列表优先包含这些动作。肌群筛选 MUST 使用统一 `muscles` 数组字段表达，一个肌群也写成单项数组。

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

#### Scenario: 过宽查询不能支撑 visibleOutputs
- **WHEN** `searchExerciseResources` input 只有默认字段，例如只包含 `suitabilities`、`published` 或 `sort`
- **AND** input 没有目标约束、器械、肌群、场地、难度、目标标签、点名动作或当前 run 可见动作锚点
- **THEN** 模型可见说明 MUST 表达该结果只能用于诊断
- **AND** 该结果 MUST NOT 支撑成功 `final_answer.visibleOutputs`

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
