## MODIFIED Requirements

### Requirement: `searchExerciseResources` 输入必须只包含动作列表结构化筛选字段
系统 SHALL 使用严格 input schema 约束 `searchExerciseResources` 入参，字段范围必须对齐当前发布态 `Exercise` 数据库可确定性执行的筛选字段和 tool 合同层定义的稳定查询语义。系统 MUST 删除 `bodyRegions`，不得再使用高层身体区域 enum 或服务端区域展开替代模型对真实数据库 facet 的选择。刷新场景 MAY 通过 `excludeExerciseIds` 排除指定发布态动作 id；点名动作已解析为数据库 id 后，MAY 通过 `requiredExerciseIds` 请求返回列表优先包含这些动作。肌群筛选 MUST 使用统一 `muscles` 数组字段表达，一个肌群也写成单项数组。

#### Scenario: 合法结构化查询
- **WHEN** 模型调用 `searchExerciseResources`
- **THEN** input schema MUST 只允许 `q`、`category`、`suitabilities`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscles`、`goalTag`、`riskTag`、`published`、`sort`、`excludeExerciseIds` 和 `requiredExerciseIds`
- **AND** `bodyRegions` MUST NOT 出现在 input schema、examples 或合法 input 中
- **AND** `muscle` MUST NOT 出现在 input schema、examples 或合法 input 中
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

#### Scenario: muscles 只表示真实肌群 facet
- **WHEN** 模型使用 `muscles`
- **THEN** `muscles` MUST 是动作库真实主肌群或辅助肌群 facet 数组
- **AND** 单个肌群 MUST 以单项数组表达
- **AND** `muscles` SHOULD 使用 `facetCatalog.muscles` 中真实出现的值
- **AND** 服务端 MUST 只对 `muscles` 做去空、去重、schema 校验和数据库 OR 查询
- **AND** 服务端 MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板增删肌群

#### Scenario: 拒绝旧 muscle 字段
- **WHEN** 模型调用 `searchExerciseResources` 时传入 `muscle`
- **THEN** input schema MUST 在 handler 执行前拒绝该调用
- **AND** repair feedback MUST 说明肌群筛选统一使用 `muscles`
- **AND** repair feedback MUST 说明单个肌群也使用一项数组
- **AND** 服务端 MUST NOT 静默把 `muscle` 转换为 `muscles`

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
- **WHEN** 模型调用 `searchExerciseResources` 时传入未知字段、`bodyRegions`、`muscle`、`purpose`、`candidateUse`、`allowedExerciseIds`、`injuryLimitations`、`requiresNoEquipment`、`resultRequirements`、`rankingHints`、`limit`、`offset`、`page` 或 `pageSize`
- **THEN** input schema MUST 在 handler 执行前拒绝该调用
- **AND** Runtime MUST 按结构化非法输入或 repair 边界处理
- **AND** 服务端 MUST NOT 根据用户原文把这些字段改写成其他业务意图
