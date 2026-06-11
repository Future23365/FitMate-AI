## ADDED Requirements

### Requirement: searchExerciseResources observation 必须区分动作事实查询和可见卡片交付
`searchExerciseResources` 的模型可见 manifest、schema description、examples 和 observation SHALL 表达：该 tool 只查询发布态动作事实，并按 `groups.<section>` 提供 section-scoped 动作来源；它不生成 `visibleTrainingProposal`、`routine`、`plan`、`prescription`、`schedule`、训练卡片、保存结果或用户记忆。当模型需要把一组动作作为用户可见、可后续引用的训练结果交付时，MUST 通过结构化收口 tool 提交可被服务端校验的 `visibleTrainingProposal`。

#### Scenario: 动作候选可作为 exercise_selection 的事实来源
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 表达 `groups.<section>.exercises[]` 是模型可见、可被服务端数据库复核的动作事实来源
- **AND** model observation MUST 表达这些动作事实可以用于构造 `visibleTrainingProposal(kind = "exercise_selection")` 的 `exerciseItems[]`
- **AND** model observation MUST 表达 `searchExerciseResources` 本身没有生成最终 `visibleTrainingProposal`
- **AND** model observation MUST 使用中文描述业务含义，`searchExerciseResources`、`groups`、`visibleTrainingProposal`、`exercise_selection`、`exerciseItems` 等技术标识保持英文原样

#### Scenario: 查询成功不等于卡片已生成
- **WHEN** 模型仅调用 `searchExerciseResources` 并获得成功结果
- **THEN** 模型可见说明 MUST 表达该结果只证明动作查询完成并返回动作事实
- **AND** 模型可见说明 MUST 表达最终用户可见训练卡片仍必须由结构化收口 tool accepted 后才能进入 `visible_output`
- **AND** 模型可见说明 MUST NOT 暗示正文列出动作名称可以替代 `visibleTrainingProposal` 结构化交付

#### Scenario: 不新增固定 kind 映射
- **WHEN** 本 change 实现 `searchExerciseResources` 模型可见说明
- **THEN** manifest、schema description、examples 和 observation MUST NOT 根据固定用户短句、关键词、正则、同义词表、具体 phrasing 或单个字段组合规定必须选择 `payload.kind = "exercise_selection"`
- **AND** `/api/chat`、LangChain runtime、tool wrapper、validator 和 response adapter MUST NOT 根据用户原文或 `searchExerciseResources` 字段组合自动生成、改写或补发 `submitVisibleTrainingProposal`
