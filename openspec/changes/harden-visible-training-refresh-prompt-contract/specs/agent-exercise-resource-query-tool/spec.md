## ADDED Requirements

### Requirement: searchExerciseResources 模型说明必须支持可见训练方案差异化刷新
`searchExerciseResources` 的模型可见说明 SHALL 表达：当 Planner 已经判断需要替换上一套用户可见 `visibleTrainingProposal` 的动作，并且已经通过当前 run 可见事实获得上一套已展示动作时，可以使用 `excludeExerciseIds` 查询替代动作。该说明 MUST NOT 把任意固定自然语言短语写成强制 tool 调用条件，也 MUST NOT 要求固定 tool 调用顺序。

#### Scenario: Manifest 描述 excludeExerciseIds 在刷新中的边界
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** 模型可见说明 MUST 表达 `excludeExerciseIds` 可用于排除用户已经看到或明确要求排除的动作 id
- **AND** 模型可见说明 MUST 表达可见训练方案刷新时，排除 id 应来自当前 run 可见的已展示动作事实
- **AND** 模型可见说明 MUST 表达未展示给用户的内部候选、trace 摘要、handler-only 结果或未读取完整事实不得默认进入 `excludeExerciseIds`
- **AND** 模型可见说明 MUST 使用中文描述业务含义，`excludeExerciseIds`、`visibleTrainingProposal`、`exerciseItems` 保持英文原样

#### Scenario: Manifest 描述保留约束查询替代动作
- **WHEN** 模型可见说明描述可见训练方案刷新
- **THEN** 说明 MUST 表达 Planner 可在保留原目标、器械、难度、居家条件、section、时长或计划约束的前提下查询替代动作
- **AND** 说明 MUST 表达不同 section 的替代动作仍应来自对应 `groups.<section>.exercises`
- **AND** 说明 MUST 表达最终刷新后的结构必须由 `final_answer.visibleOutputs[]` 中的 `visibleTrainingProposal.payload` 承载
- **AND** 说明 MUST 表达 `searchExerciseResources` 本身不生成 routine、plan、prescription、schedule 或训练卡片

#### Scenario: 不固定刷新 tool 顺序
- **WHEN** 用户请求可能涉及替换上一套训练方案
- **THEN** 模型可见合同 MUST 允许 Planner 基于上下文自主决定是否先读取事实、直接查询、澄清或失败收口
- **AND** `searchExerciseResources` manifest MUST NOT 表达成用户说某个固定短语时必须调用本 tool
- **AND** `searchExerciseResources` manifest MUST NOT 表达成所有刷新请求都必须先调用指定 tool
- **AND** `/api/chat`、Agent core、renderer 和 tool handler MUST NOT 根据用户原文强制调用 `searchExerciseResources`

#### Scenario: 排除后候选不足
- **WHEN** `searchExerciseResources` 在应用 `excludeExerciseIds` 后返回空结果或候选不足
- **THEN** 模型可见 observation MUST 表达当前条件下可替换候选不足
- **AND** 模型 MAY 基于该结果说明无法完全换新、询问是否放宽条件或复用用户明确要求保留的动作
- **AND** 系统 MUST NOT 为了填满新方案而回填已被排除的用户已看到动作
