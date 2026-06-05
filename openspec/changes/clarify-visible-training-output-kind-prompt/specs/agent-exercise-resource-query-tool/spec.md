## ADDED Requirements

### Requirement: searchExerciseResources examples 必须展示 routine / plan 缺 section 补查输入
`searchExerciseResources` 的模型可见 examples SHALL 展示当目标需要 `routine` 或 `plan`、当前 run 已有 `training` 动作事实但缺少 `warmup` / `stretch` 时，如何沿用当前目标约束查询缺失 section 候选。该 example 只说明动作事实查询输入形态，不得承诺 tool 会生成最终训练结构。

#### Scenario: Examples 包含 warmup 和 stretch 补查
- **WHEN** production registry 序列化 `searchExerciseResources` manifest 给 Planner
- **THEN** manifest examples MUST 包含使用 `suitabilities = ["warmup", "stretch"]` 查询热身和拉伸候选的合法 input
- **AND** example input SHOULD 包含至少一个可解释的真实 facet、器械、场地或难度约束
- **AND** example description MUST 说明这是在 `routine` 或 `plan` 目标已有 `training` 动作事实但缺少支持 section 时的补查
- **AND** example description MUST 使用中文描述业务含义，`searchExerciseResources`、`suitabilities`、`warmup`、`stretch`、`routine`、`plan` 保持英文原样

#### Scenario: Tool 说明与输出类型选择指南一致
- **WHEN** `searchExerciseResources` manifest 描述缺 section 场景
- **THEN** manifest MUST 说明如果模型目标已经需要 `routine` 或 `plan`，且当前 run 只有 `training` 动作事实，模型应优先沿用当前目标约束查询缺失 section
- **AND** manifest MUST 说明普通动作推荐、动作清单或动作事实问答不要求固定查询 `warmup` / `training` / `stretch`
- **AND** manifest MUST NOT 要求所有训练相关请求都固定再次调用 `searchExerciseResources`
- **AND** manifest MUST NOT 把具体用户短句映射成固定 `payload.kind`

#### Scenario: Tool 仍只提供动作事实
- **WHEN** `searchExerciseResources` 执行成功
- **THEN** tool output MUST 仍只提供发布态动作事实查询结果
- **AND** tool output MUST NOT 生成 `visibleTrainingProposal`
- **AND** tool output MUST NOT 生成 `routine`、`plan`、`prescription` 或 `schedule`
- **AND** tool handler MUST NOT 根据用户自然语言、关键词、短句模板或同义词表替模型选择动作或输出结构
