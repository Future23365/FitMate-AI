## ADDED Requirements

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
系统 SHALL 使用严格 input schema 约束 `searchExerciseResources` 入参，字段范围必须对齐当前动作列表查询和 `Exercise` 模型可确定性执行的筛选字段。

#### Scenario: 合法结构化查询
- **WHEN** 模型调用 `searchExerciseResources`
- **THEN** input schema MUST 只允许 `q`、`category`、`suitability`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`goalTag`、`riskTag`、`published` 和 `sort`
- **AND** `suitability` MUST 只允许 `warmup`、`training` 或 `stretch`
- **AND** `sort` MUST 只允许 `name_asc`、`name_desc`、`level_asc`、`level_desc`、`category_asc` 或 `category_desc`
- **AND** 缺省 `sort` MUST 为 `name_asc`
- **AND** 缺省发布态口径 MUST 为 `published = true`

#### Scenario: 拒绝消费侧和分页字段
- **WHEN** 模型调用 `searchExerciseResources` 时传入未知字段、`purpose`、`candidateUse`、`allowedExerciseIds`、`excludedExerciseIds`、`injuryLimitations`、`requiresNoEquipment`、`resultRequirements`、`rankingHints`、`limit`、`offset`、`page` 或 `pageSize`
- **THEN** input schema MUST 在 handler 执行前拒绝该调用
- **AND** Runtime MUST 按结构化非法输入或 repair 边界处理
- **AND** 服务端 MUST NOT 根据用户原文把这些字段改写成其他业务意图

#### Scenario: 普通生产聊天不能查询未发布动作
- **WHEN** production `/api/chat` 中模型调用 `searchExerciseResources` 且请求未携带受控管理员能力
- **THEN** 工具 MUST 只查询发布态动作
- **AND** 如果输入显式要求 `published = false`，系统 MUST 返回结构化输入或权限失败
- **AND** 系统 MUST NOT 查询或投影未发布动作

### Requirement: `searchExerciseResources` 必须返回查询摘要和动作资源摘要
系统 SHALL 让 `searchExerciseResources` 返回稳定的成功 output，包含实际查询口径、命中数量、截断状态和有限动作资源摘要。

#### Scenario: 查询成功并返回动作
- **WHEN** `searchExerciseResources` 使用合法输入完成数据库查询
- **THEN** output MUST 包含 `status: "succeeded"`
- **AND** output MUST 包含 `query.sort`、`query.published`、`query.appliedFilters`、`query.totalMatches`、`query.returnedCount`、`query.maxReturned` 和 `query.truncated`
- **AND** output MUST 包含 `exercises`
- **AND** 每个动作摘要 MUST 至少包含 `id`、`nameZh`、`nameEn`、器械、居家条件、主肌群、辅助肌群、`allowedSections`、`goalTags`、`riskTags`、图片 URL 和发布态摘要字段

#### Scenario: 查询命中为空
- **WHEN** `searchExerciseResources` 的合法查询得到 `totalMatches = 0`
- **THEN** 工具 MUST 返回成功 output
- **AND** fulfillment MUST 表示 `satisfied = true`
- **AND** 模型 MAY 基于该 tool result 解释没有找到符合条件的动作
- **AND** 系统 MUST NOT 将空结果伪装成数据库失败或训练生成失败

#### Scenario: 底层读取或输出合同失败
- **WHEN** 数据库不可用、handler 抛出异常或 handler output 不符合 output schema
- **THEN** Executor 或等价执行边界 MUST 返回结构化 failed `ToolResult`
- **AND** 完整失败 payload MUST NOT 默认进入模型观察、用户事件或 trace
- **AND** 模型 MUST NOT 用 failed result 支撑成功 `final_answer`

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
系统 SHALL 在 tool manifest、schema 描述或 examples 中为模型提供 `searchExerciseResources` 的使用边界，且不得把该 tool 的业务特例写入通用 Agent prompt。

#### Scenario: Manifest 说明何时使用和何时不用
- **WHEN** Agent 构造 Planner 可见 tool manifest
- **THEN** `searchExerciseResources` 的模型可见说明 MUST 表达它适用于查询符合结构化条件的发布态动作列表
- **AND** 模型可见说明 MUST 表达它不适用于生成训练、保存结果、读取单个动作完整详情、解析唯一动作名、统计全库 facet 或构建 routine / plan / patch 候选集合
- **AND** 模型可见说明 MUST 表达成功结果可以通过 `usedToolResultIds` 支撑普通 `final_answer`
- **AND** 模型可见说明 MUST 表达 failed 或非法输入结果不能支撑成功 `final_answer`

#### Scenario: 通用 prompt 不写业务 toolName 特例
- **WHEN** 本 change 更新模型可见合同
- **THEN** 系统 MUST NOT 在通用 Agent prompt 中新增基于 `searchExerciseResources` 的业务路由规则
- **AND** 系统 MUST NOT 新增服务端关键词、正则、同义词表或短句模板来强制选择该 tool

### Requirement: `searchExerciseResources` 必须具备 tool-level 验证
系统 SHALL 为 `searchExerciseResources` 提供直接覆盖真实 tool 执行入口的自动化测试，而不能只验证 registry 或 manifest 暴露。

#### Scenario: Tool 单测覆盖业务行为和安全边界
- **WHEN** 本 change 完成实现
- **THEN** 自动化测试 MUST 直接覆盖 `searchExerciseResources` 的 handler、`executeTool` 或当前真实 runtime 执行入口
- **AND** 测试 MUST 覆盖成功路径、schema 拒绝、发布态默认值、`published = false` 拒绝、空结果、截断摘要、projection / redaction、trace summary 和 handler 失败归一化
- **AND** 测试 MUST 使用接近 AITest 真实动作库查询的健身业务输入
- **AND** 测试 MUST 证明该 tool 不产出 `candidateSetId`、`candidate_set` resource、训练卡片或保存事件

#### Scenario: Contract 和架构测试覆盖注册边界
- **WHEN** 本 change 完成实现
- **THEN** contract tests MUST 验证 `searchExerciseResources` 的 manifest schema、policy metadata、projection 和 redaction 边界
- **AND** architecture tests MUST 证明 Agent core 中没有具体业务 toolName 分支
- **AND** architecture tests MUST 证明 `/api/chat` 没有业务关键词分流
- **AND** production registry tests MUST 证明没有 fixture tools、训练生成、保存、用户记忆或未授权业务 tool 被注册
