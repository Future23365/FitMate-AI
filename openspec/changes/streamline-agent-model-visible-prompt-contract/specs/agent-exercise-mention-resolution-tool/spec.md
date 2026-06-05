## ADDED Requirements

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
