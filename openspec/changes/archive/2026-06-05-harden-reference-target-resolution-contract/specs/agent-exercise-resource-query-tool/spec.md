## ADDED Requirements

### Requirement: `searchExerciseResources` observation 必须声明不证明已有引用对象
`searchExerciseResources` 的模型可见 observation SHALL 表达该 tool 只提供当前查询返回的动作库事实。Observation MUST NOT 让模型把动作查询结果误认为当前 run 存在可刷新、可替换或可调整的上一轮用户可见对象。

#### Scenario: 动作查询结果不证明存在可操作对象
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 表达本次查询只提供 `groups.<section>.exercises[]` 中的动作事实
- **AND** model observation MUST 表达本次查询不证明当前 run 存在上一套可操作的 `visibleTrainingProposal`
- **AND** model observation MUST 表达本次查询不证明已经完成对已有训练方案的刷新、替换或调整
- **AND** model observation MUST 使用中文描述业务含义，`searchExerciseResources`、`groups`、`visibleTrainingProposal` 等技术标识保持英文原样

#### Scenario: 未应用排除条件时不得宣称刷新成功
- **WHEN** `searchExerciseResources` 的模型可见 observation 表达未应用 `excludeExerciseIds`
- **THEN** observation MUST 表达如果目标是操作已有对象，应先基于当前可见引用事实确认对象
- **AND** observation MUST 表达引用对象不可见时，不得使用本次动作查询结果宣称刷新、替换或调整成功
- **AND** observation MUST NOT 要求固定调用 `inspectVisibleTrainingProposals`、固定调用 `read_recent` 或固定输出某个 `payload.kind`
