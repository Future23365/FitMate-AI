## MODIFIED Requirements

### Requirement: `searchExerciseResources` 输入必须只包含动作列表结构化筛选字段
系统 SHALL 使用严格 input schema 约束 `searchExerciseResources` 入参，字段范围必须对齐当前动作列表查询和 `Exercise` 模型可确定性执行的筛选字段，并区分高层身体区域与真实肌群 facet。

#### Scenario: 合法结构化查询
- **WHEN** 模型调用 `searchExerciseResources`
- **THEN** input schema MUST 只允许 `q`、`category`、`suitability`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`bodyRegions`、`goalTag`、`riskTag`、`published` 和 `sort`
- **AND** `suitability` MUST 只允许 `warmup`、`training` 或 `stretch`
- **AND** `bodyRegions` MUST 只允许 `upper_body`、`lower_body`、`core` 或 `full_body`
- **AND** `sort` MUST 只允许 `name_asc`、`name_desc`、`level_asc`、`level_desc`、`category_asc` 或 `category_desc`
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
系统 SHALL 为 `searchExerciseResources` 使用专用动作资源查询 repository，在数据库层执行发布态、结构化字段和 `bodyRegions` 展开后的真实肌群筛选，并避免每次 tool 调用读取全量 `Exercise` 数据后再内存过滤。

#### Scenario: Repository 查询下推结构化筛选
- **WHEN** `searchExerciseResources` handler 接收到合法结构化输入
- **THEN** handler MUST 调用专用 repository 查询入口，而不是调用 `listExerciseRecords()`、`listAllExercises()`、旧 `searchExercises()` 或其他全量动作读取入口
- **AND** repository MUST 将 `published`、`category`、`suitability`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`bodyRegions`、`goalTag`、`riskTag` 和 `q` 转换为数据库可执行 `where` 条件
- **AND** repository MUST 只根据结构化 `bodyRegions` 枚举展开真实肌群 facet
- **AND** repository MUST 使用同一 `where` 执行 `count()` 来生成 `totalMatches`
- **AND** repository MUST 使用服务端内部固定 `maxReturned` 执行 `findMany({ take: maxReturned + 1 })` 或等价查询来判断 `truncated`
- **AND** `maxReturned`、`take`、`offset`、`page` 或 `pageSize` MUST NOT 由 LLM 输入控制

### Requirement: `searchExerciseResources` 模型可见说明必须表达业务边界
系统 SHALL 在 tool manifest、schema 描述或 examples 中为模型提供 `searchExerciseResources` 的使用边界，且不得把该 tool 的业务特例写入通用 Agent prompt。

#### Scenario: Manifest 说明何时使用和何时不用
- **WHEN** Agent 构造 Planner 可见 tool manifest
- **THEN** `searchExerciseResources` 的模型可见说明 MUST 表达它适用于查询符合结构化条件的发布态动作列表
- **AND** 模型可见说明 MUST 表达高层身体区域应使用 `bodyRegions`
- **AND** 模型可见说明 MUST 表达 `muscle` 只用于动作库真实主肌群或辅助肌群 facet
- **AND** 模型可见说明 MUST 表达它不适用于生成训练、保存结果、读取单个动作完整详情、解析唯一动作名、统计全库 facet 或构建 routine / plan / patch 候选集合
- **AND** 模型可见说明 MUST 表达成功且 `satisfied=true` 的结果可以通过 `usedToolResultIds` 支撑普通 `final_answer`
- **AND** 模型可见说明 MUST 表达 failed、非法输入或 `satisfied=false` 结果不能支撑成功动作推荐

### Requirement: `searchExerciseResources` 必须具备 tool-level 验证
系统 SHALL 为 `searchExerciseResources` 提供直接覆盖真实 tool 执行入口的自动化测试，而不能只验证 registry 或 manifest 暴露。

#### Scenario: Tool 单测覆盖业务行为和安全边界
- **WHEN** 本 change 完成实现
- **THEN** 自动化测试 MUST 直接覆盖 `searchExerciseResources` 的 handler、`executeTool` 或当前真实 runtime 执行入口
- **AND** 测试 MUST 覆盖 `bodyRegions=["lower_body"]` 能返回真实下肢动作
- **AND** 测试 MUST 覆盖 `muscle="腿部"` 这种未知精确 facet 的空结果不会被标记为 `satisfied=true`
- **AND** 测试 MUST 覆盖成功路径、schema 拒绝、发布态默认值、`published = false` 拒绝、空结果、数据库下推查询、projection / redaction、trace summary 和 handler 失败归一化
- **AND** 测试 MUST 使用接近 AITest 真实动作库查询的健身业务输入
- **AND** 测试 MUST 证明该 tool 不产出 `candidateSetId`、`candidate_set` resource、训练卡片或保存事件
