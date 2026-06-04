## MODIFIED Requirements

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

## ADDED Requirements

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
