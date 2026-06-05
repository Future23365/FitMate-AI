## ADDED Requirements

### Requirement: `searchExerciseResources` 模型可见合同必须支持 routine 正向补齐
`searchExerciseResources` 的模型可见 manifest、schema description、examples 和 observation SHALL 表达：该 tool 只提供动作事实，但当模型目标已经需要 `routine` 且当前结果只覆盖部分 section 时，继续查询缺失 section 是正常组合步骤。该合同 MUST NOT 让 tool 生成最终 `routine`、`plan`、处方、schedule、卡片或保存结果。

#### Scenario: Manifest 表达缺失 section 的正向补查
- **WHEN** Agent 序列化 `searchExerciseResources` manifest
- **THEN** 模型可见说明 MUST 表达明确 `routine` 目标已有 `training` 动作事实时，可以使用相同目标、器械、场地、难度或肌群约束继续查询 `suitabilities = ["warmup", "stretch"]`
- **AND** 模型可见说明 MUST 表达在候选足够时应继续组合完整 `routine`，而不是让用户自行把 `training` 动作列表组合成训练
- **AND** 模型可见说明 MUST 使用中文描述业务含义，`searchExerciseResources`、`suitabilities`、`warmup`、`training`、`stretch`、`routine`、`visibleTrainingProposal` 等技术标识保持英文原样

#### Scenario: Observation 区分可补查缺口和候选不足
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **AND** observation 的 `missingSectionsForRoutineOrPlan` 非空
- **THEN** observation MUST 表达当前结果不能单独支撑成功 `routine`
- **AND** observation MUST 表达若目标已是 `routine` 且当前约束足够，下一步应优先继续查询缺失 section 的动作事实
- **AND** observation MUST 表达缺失 section 查询无候选、约束冲突或查询过宽时，应说明缺口、建议放宽条件、使用 `ask_user` 或不带 `visibleOutputs` 的 `final_answer` 收口

#### Scenario: Tool 仍不承担最终训练生成职责
- **WHEN** `searchExerciseResources` 执行成功
- **THEN** tool output MUST NOT 生成 `visibleTrainingProposal`、`routine`、`plan`、`prescription`、`schedule`、训练卡片、保存事件或 `candidate_set` resource
- **AND** tool handler MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板决定最终输出结构
