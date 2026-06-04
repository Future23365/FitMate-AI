# agent-exercise-mention-resolution-tool Specification

## Purpose
TBD - created by archiving change support-exercise-mention-required-query. Update Purpose after archive.
## Requirements
### Requirement: `resolveExerciseResourceMentions` 必须解析用户点名动作到数据库动作资源

系统 SHALL 提供低风险只读业务 tool `resolveExerciseResourceMentions`，用于把模型显式传入的用户点名动作文本解析为发布态数据库 `Exercise` 摘要。该 tool 只做数据库事实查询，不生成训练方案、训练卡片、保存事件、artifact 或用户记忆。

#### Scenario: 解析多个点名动作
- **WHEN** Planner 调用 `resolveExerciseResourceMentions` 并传入 `mentions = [{ text: "俯卧撑" }, { text: "深蹲" }, { text: "平板支撑" }]`
- **THEN** tool MUST 按输入顺序返回每个 mention 的解析结果
- **AND** 每个结果 MUST 包含原始 `text`、稳定 `status` 和有限动作摘要列表
- **AND** 命中的动作摘要 MUST 包含 `exerciseId`、`nameZh`、`nameEn`、`equipmentZh`、`homeRequirementZh`、`primaryMusclesZh`、`allowedSections`、`imageUrl` 和发布态摘要字段

#### Scenario: 不读取用户完整自然语言做拆词
- **WHEN** 用户消息包含多个自然语言动作描述
- **THEN** 服务端 MUST NOT 从 latest user message、conversationSummary 或历史文本中用关键词、正则、同义词表或短句模板拆出动作名
- **AND** tool handler MUST 只处理 Planner 已经结构化传入的 `mentions`

#### Scenario: 解析结果存在歧义
- **WHEN** 某个 mention 匹配多个可发布动作且无法确定唯一动作
- **THEN** 对应结果 MUST 使用 `status = "ambiguous"`
- **AND** 结果 MUST 返回有限数量候选摘要供模型选择、重查或澄清
- **AND** tool MUST NOT 在服务端替模型选择某个候选作为用户语义

#### Scenario: 解析结果未命中
- **WHEN** 某个 mention 在发布态动作库中没有可用匹配
- **THEN** 对应结果 MUST 使用 `status = "not_found"`
- **AND** 结果 MUST 包含结构化诊断，说明该 mention 未解析为数据库动作
- **AND** 该结果 MUST NOT 被模型当作可写入 `visibleTrainingProposal` 的动作来源

### Requirement: `resolveExerciseResourceMentions` 输入必须保持结构化和有界

系统 SHALL 使用严格 input schema 约束 `resolveExerciseResourceMentions`，只允许模型传入有限数量的点名动作文本和可选 section hint，不允许传入分页、任意 SQL、用户 id、完整聊天文本或训练生成参数。

#### Scenario: 合法输入
- **WHEN** Planner 调用 `resolveExerciseResourceMentions`
- **THEN** input schema MUST 只允许 `mentions` 和必要的固定查询选项
- **AND** `mentions` MUST 是非空数组且有服务端数量上限
- **AND** 每个 mention MUST 至少包含 `text`
- **AND** 可选 `sectionHint` MUST 只允许 `warmup`、`training` 或 `stretch`

#### Scenario: 拒绝越界字段
- **WHEN** Planner 传入 `candidateUse`、`resultRequirements`、`routine`、`plan`、`schedule`、`page`、`pageSize`、`userId`、`sql` 或完整用户消息等未知字段
- **THEN** input schema MUST 在 handler 执行前拒绝该调用
- **AND** Runtime MUST 按结构化非法输入或 repair 边界处理

### Requirement: `resolveExerciseResourceMentions` 必须提供安全投影和模型可见说明

系统 SHALL 为 `resolveExerciseResourceMentions` 提供中文模型可见说明、examples、model observation、user projection 和 trace summary，且不得泄漏完整数据库记录或内部 handler output。

#### Scenario: 模型可见说明表达使用边界
- **WHEN** Agent 构造 Planner 可见 tool manifest
- **THEN** `resolveExerciseResourceMentions` 的 `description`、`whenToUse`、`whenNotToUse` 和 examples MUST 默认使用中文描述
- **AND** 说明 MUST 表达该 tool 用于解析用户点名动作是否存在于数据库
- **AND** 说明 MUST 表达需要最终返回动作列表时，应把 matched `exerciseId` 传给 `searchExerciseResources.requiredExerciseIds`
- **AND** 说明 MUST 表达该 tool 不生成 routine、plan、训练卡片或保存结果

#### Scenario: projection 不泄漏完整数据库事实
- **WHEN** `resolveExerciseResourceMentions` 返回 handler output
- **THEN** model observation 和 user projection MUST 只包含有限动作摘要、匹配状态和诊断
- **AND** projection MUST NOT 包含完整 `Exercise` 记录、数据库连接对象、embedding 向量、内部排序细节、secret 或跨用户数据

### Requirement: `resolveExerciseResourceMentions` 必须具备 tool-level 验证

系统 SHALL 为 `resolveExerciseResourceMentions` 提供直接覆盖 handler、`executeTool` 或当前真实 runtime 执行入口的自动化测试。

#### Scenario: Tool 单测覆盖真实健身场景
- **WHEN** 本 change 完成实现
- **THEN** 测试 MUST 覆盖“俯卧撑、深蹲、平板支撑”多点名动作解析
- **AND** 测试 MUST 覆盖成功命中、歧义、未命中、非法 input、数量上限、projection / redaction、trace summary 和 handler 失败归一化
- **AND** 测试 MUST 证明该 tool 不产出 `candidateSetId`、`candidate_set` resource、训练卡片、保存事件或任意旧兼容业务事件

