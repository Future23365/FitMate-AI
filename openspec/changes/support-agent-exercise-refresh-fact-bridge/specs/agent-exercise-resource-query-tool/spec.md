## MODIFIED Requirements

### Requirement: `searchExerciseResources` 输入必须只包含动作列表结构化筛选字段
系统 SHALL 使用严格 input schema 约束 `searchExerciseResources` 入参，字段范围必须对齐当前动作列表查询和 `Exercise` 模型可确定性执行的筛选字段。刷新场景 MAY 通过 `excludeExerciseIds` 排除指定发布态动作 id。

#### Scenario: 合法结构化查询
- **WHEN** 模型调用 `searchExerciseResources`
- **THEN** input schema MUST 只允许 `q`、`category`、`suitability`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`bodyRegions`、`goalTag`、`riskTag`、`published`、`sort` 和 `excludeExerciseIds`
- **AND** `excludeExerciseIds` MUST 是去重后的动作 id 数组，并且数量 MUST 有服务端上限
- **AND** `suitability` MUST 只允许 `warmup`、`training` 或 `stretch`
- **AND** 缺省 `sort` MUST 为 `name_asc`
- **AND** 缺省发布态口径 MUST 为 `published = true`

#### Scenario: 排除指定动作 id
- **WHEN** `searchExerciseResources` 收到合法 `excludeExerciseIds`
- **THEN** repository 查询 MUST 在数据库层排除这些动作 id
- **AND** 被排除动作 MUST NOT 出现在 `exercises` 输出中
- **AND** `appliedFilters` 或等价查询摘要 MUST 能记录本次存在排除条件，但不得泄漏不该展示的完整历史 payload

#### Scenario: 拒绝消费侧和分页字段
- **WHEN** 模型调用 `searchExerciseResources` 时传入未知字段、`purpose`、`candidateUse`、`allowedExerciseIds`、`injuryLimitations`、`requiresNoEquipment`、`resultRequirements`、`rankingHints`、`limit`、`offset`、`page` 或 `pageSize`
- **THEN** input schema MUST 在 handler 执行前拒绝该调用
- **AND** Runtime MUST 按结构化非法输入或 repair 边界处理
- **AND** 服务端 MUST NOT 根据用户原文把这些字段改写成其他业务意图

### Requirement: `searchExerciseResources` 必须下推数据库查询且不得全表读取
系统 SHALL 为 `searchExerciseResources` 使用专用动作资源查询 repository，在数据库层执行发布态、结构化字段和排除条件筛选，并避免每次 tool 调用读取全量 `Exercise` 数据后再内存过滤。

#### Scenario: Repository 查询下推结构化筛选
- **WHEN** `searchExerciseResources` handler 接收到合法结构化输入
- **THEN** handler MUST 调用专用 repository 查询入口，而不是调用 `listExerciseRecords()`、`listAllExercises()`、旧 `searchExercises()` 或其他全量动作读取入口
- **AND** repository MUST 将 `published`、`category`、`suitability`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`bodyRegions`、`goalTag`、`riskTag`、`q` 和 `excludeExerciseIds` 转换为数据库可执行 `where` 条件
- **AND** repository MUST 使用同一 `where` 执行 `count()` 来生成 `totalMatches`
- **AND** repository MUST 使用服务端内部固定 `maxReturned` 执行 `findMany({ take: maxReturned + 1 })` 或等价查询来判断 `truncated`
- **AND** `maxReturned`、`take`、`offset`、`page` 或 `pageSize` MUST NOT 由 LLM 输入控制

#### Scenario: 排除后候选不足
- **WHEN** 合法查询在应用 `excludeExerciseIds` 后返回 0 个或不足以形成有用回答的动作
- **THEN** tool result MUST 使用结构化摘要表达 `totalMatches`、`returnedCount`、`excludedCount` 或等价候选不足信息
- **AND** 模型 MAY 基于该结果解释当前条件下没有更多未展示动作，或向用户澄清是否放宽条件
- **AND** 系统 MUST NOT 回填已被排除的用户已看到动作来假装刷新成功

### Requirement: `searchExerciseResources` 模型可见说明必须表达刷新排除边界
系统 SHALL 在 tool manifest、schema 描述或 examples 中为模型提供 `searchExerciseResources` 的使用边界，且不得把该 tool 的业务特例写入通用 Agent prompt。

#### Scenario: Manifest 说明排除字段用法
- **WHEN** Agent 构造 Planner 可见 tool manifest
- **THEN** `searchExerciseResources` 的模型可见说明 MUST 表达 `excludeExerciseIds` 只用于排除用户已看到或用户明确要求排除的动作 id
- **AND** 模型可见说明 MUST 表达“再推荐一批 / 换一批”应尽量基于当前 run 已恢复的用户可见动作事实填充排除 id
- **AND** 模型可见说明 MUST 表达未展示给用户的内部候选或未读取完整事实不得被默认排除
- **AND** 通用 Agent prompt MUST NOT 新增 `searchExerciseResources` toolName 特例或服务端关键词路由规则

### Requirement: `searchExerciseResources` 必须具备 tool-level 验证
系统 SHALL 为 `searchExerciseResources` 提供直接覆盖真实 tool 执行入口的自动化测试，而不能只验证 registry 或 manifest 暴露。

#### Scenario: Tool 单测覆盖刷新排除
- **WHEN** 本 change 完成实现
- **THEN** 自动化测试 MUST 直接覆盖 `searchExerciseResources` 的 handler、`executeTool` 或当前真实 runtime 执行入口
- **AND** 测试 MUST 覆盖 `excludeExerciseIds` 去重、数量上限、非法 id 拒绝、数据库层排除、排除后候选不足和摘要投影
- **AND** 测试 MUST 证明被排除动作不会出现在返回动作中
- **AND** 测试 MUST 证明该 tool 仍不产出 `candidateSetId`、`candidate_set` resource、训练卡片或保存事件
