## ADDED Requirements

### Requirement: searchExerciseResources 必须支持完整 routine 的 section 事实规划
`searchExerciseResources` 的模型可见说明 SHALL 表达该 tool 可以按 `suitabilities` 查询 `warmup`、`training`、`stretch` 各 section 的动作库事实，并通过 `groups.<section>.exercises[]`、`sectionSummary`、`availableSections` 和 `missingSections` 暴露当前查询覆盖。说明 MUST 支持模型为完整 `routine` 自主规划 section 动作事实，但不得把 section 缺口写成固定继续调用流程。

#### Scenario: manifest 表达 suitabilities section 查询能力
- **WHEN** production registry 序列化 `searchExerciseResources` manifest 或 schema description
- **THEN** 模型可见说明 MUST 表达 `suitabilities` 可使用 `warmup`、`training`、`stretch`
- **AND** 模型可见说明 MUST 表达完整单次训练 `routine` 通常需要分别获得对应 section 的动作事实
- **AND** 模型可见说明 MUST 使用中文描述业务含义，`suitabilities`、`warmup`、`training`、`stretch` 保持英文原样

#### Scenario: 查询覆盖事实不替模型选择下一步
- **WHEN** `searchExerciseResources` observation 暴露 `availableSections` 或 `missingSections`
- **THEN** 模型可见说明 MUST 表达这些字段只描述当前查询口径下的 section 覆盖事实
- **AND** 模型可见说明 MUST NOT 表达缺少 `warmup`、`training` 或 `stretch` 时必须继续调用 `searchExerciseResources`
- **AND** 模型可见说明 MUST NOT 表达查询结果必须通过某个固定业务 tool 收口
