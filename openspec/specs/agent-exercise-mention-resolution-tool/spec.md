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
系统 SHALL 为 `resolveExerciseResourceMentions` 提供中文模型可见说明、examples、model-visible summary、user projection 和 trace summary，且不得泄漏完整数据库记录或内部 handler output。模型可见内容 MUST 聚焦 mention 解析事实、候选状态、有限动作摘要和 diagnostics；MUST NOT 表达业务目标满足度，也 MUST NOT 指挥模型下一步必须调用某个具体业务 tool。

#### Scenario: 模型可见说明表达 mention 解析与下游使用
- **WHEN** Agent 构造 Planner 可见 tool manifest 或 tool result summary
- **THEN** `resolveExerciseResourceMentions` 的 description、schema description、examples 和 summary MUST 默认使用中文描述
- **AND** 说明 MUST 表达该 tool 只把模型结构化传入的用户点名动作文本解析为发布态 Exercise 候选
- **AND** 说明 MAY 表达 matched 或模型选择后的候选 id 可作为后续动作库查询、结构化输出或澄清的事实材料
- **AND** 说明 MUST 表达 `ambiguous` 代表存在多个候选事实，`not_found` 代表未解析为数据库动作事实
- **AND** 说明 MUST NOT 表达 `fulfillment`、`satisfied`、`supportsOutputKinds`、`finalAnswerSupport` 或等价业务满足度 / 输出可行性判断
- **AND** 说明 MUST NOT 表达 matched 结果必须继续调用 `searchExerciseResources`
- **AND** 说明 MUST NOT 表达 matched 结果已经生成最终 `visibleTrainingProposal`、routine、plan、训练卡片或保存结果

#### Scenario: observation 保留后续衔接边界但不指挥下一步
- **WHEN** model-visible summary 包含 matched、ambiguous 或 not_found 结果
- **THEN** summary MUST 表达有限候选摘要和 `allowedSections` 等可复核动作事实
- **AND** summary MAY 表达这些候选事实可被模型用于后续自主推理
- **AND** summary MUST NOT 要求固定下一步必须调用 `searchExerciseResources`
- **AND** summary MUST NOT 根据用户原文替模型决定是否澄清、重查、直接回答或提交结构化输出
- **AND** summary MUST NOT 包含 `nextActionHints`、`continue_tool_call`、`ask_user` 或等价下一步 action 枚举

### Requirement: `resolveExerciseResourceMentions` 必须具备 tool-level 验证

系统 SHALL 为 `resolveExerciseResourceMentions` 提供直接覆盖 handler、`executeTool` 或当前真实 runtime 执行入口的自动化测试。

#### Scenario: Tool 单测覆盖真实健身场景
- **WHEN** 本 change 完成实现
- **THEN** 测试 MUST 覆盖“俯卧撑、深蹲、平板支撑”多点名动作解析
- **AND** 测试 MUST 覆盖成功命中、歧义、未命中、非法 input、数量上限、projection / redaction、trace summary 和 handler 失败归一化
- **AND** 测试 MUST 证明该 tool 不产出 `candidateSetId`、`candidate_set` resource、训练卡片、保存事件或任意旧兼容业务事件

### Requirement: `resolveExerciseResourceMentions` 模型可见说明必须聚焦点名动作解析
系统 SHALL 将 `resolveExerciseResourceMentions` 的模型可见说明收敛为点名动作身份解析 tool 的独有能力说明。Manifest MUST 保留该 tool 如何从 Planner 结构化 `mentions` 查询发布态动作摘要，以及如何衔接 `searchExerciseResources.requiredExerciseIds`；MUST NOT 重复完整最终训练输出规则。

#### Scenario: manifest 保留点名动作解析边界
- **WHEN** production registry 序列化 `resolveExerciseResourceMentions` manifest
- **THEN** manifest MUST 表达该 tool 只解析 Planner 结构化传入的用户点名动作文本
- **AND** manifest MUST 表达服务端不从完整用户消息、历史摘要或 conversationSummary 中做关键词拆词
- **AND** manifest MUST 表达结果状态包括 `matched`、`ambiguous` 和 `not_found`
- **AND** manifest MUST 表达 matched `exerciseId` 可用于后续 `searchExerciseResources.requiredExerciseIds`
- **AND** manifest MUST 使用中文描述业务含义，`resolveExerciseResourceMentions`、`mentions`、`matched`、`ambiguous`、`not_found`、`searchExerciseResources.requiredExerciseIds` 保持英文原样

#### Scenario: manifest 不重复最终训练结构长规则
- **WHEN** production registry 序列化 `resolveExerciseResourceMentions` manifest
- **THEN** manifest MUST NOT 逐段重复 system prompt 中关于 `visibleOutputs[]`、`visibleTrainingProposal.payload.kind`、routine / plan section coverage 或 `final_answer.content` 终态的完整规则
- **AND** manifest MUST 用短边界表达“本 tool 只确认动作身份，不直接作为最终训练方案动作来源”
- **AND** manifest MUST 表达最终训练方案动作事实仍需来自 section-scoped 动作查询结果或当前 run 可消费训练事实

#### Scenario: examples 保留结构化 mentions 示例
- **WHEN** production registry 序列化 `resolveExerciseResourceMentions` examples
- **THEN** examples MUST 展示合法 `mentions` 数组
- **AND** examples MUST 包含多个点名动作的结构化输入示例
- **AND** examples MUST NOT 包含完整用户消息、分页、userId、SQL、训练生成参数或 fake resource id
- **AND** examples MUST NOT 表达用户说某个固定短语时必须调用该 tool

### Requirement: `resolveExerciseResourceMentions` observation 必须保留解析结果和后续衔接边界
系统 SHALL 在 `resolveExerciseResourceMentions` 的模型 observation 中保留解析结果摘要和必要后续衔接边界。Observation MUST 帮助 Planner 判断是否选择候选、重查、澄清或将 matched id 作为 `requiredExerciseIds`；MUST NOT 复制完整通用终态规则。

#### Scenario: observation 保留匹配状态
- **WHEN** `resolveExerciseResourceMentions` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 表达 `mentionCount`
- **AND** model observation MUST 表达 `matchedCount`
- **AND** model observation MUST 表达 `ambiguousCount`
- **AND** model observation MUST 表达 `notFoundCount`
- **AND** model observation MUST 为每个 result 提供有限候选摘要和 `allowedSections`

#### Scenario: observation 保留后续 requiredExerciseIds 衔接
- **WHEN** model observation 包含 matched 或模型可选择的 ambiguous 候选
- **THEN** observation MUST 表达这些候选的 `exerciseId` 可作为后续 `searchExerciseResources.requiredExerciseIds`
- **AND** observation MUST 表达该 observation 本身不能直接作为 `visibleTrainingProposal.exerciseItems[*].exerciseId` 的动作事实来源
- **AND** observation MUST NOT 要求固定下一步必须调用 `searchExerciseResources`
- **AND** observation MUST NOT 根据用户原文替模型决定是否澄清、重查或继续生成

