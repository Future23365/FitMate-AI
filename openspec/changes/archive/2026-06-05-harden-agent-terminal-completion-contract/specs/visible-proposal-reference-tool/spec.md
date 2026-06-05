## ADDED Requirements

### Requirement: visible proposal read/import observation 必须表达终态边界
`inspectVisibleTrainingProposals` 的模型可见说明和 `read_recent` observation SHALL 表达：该 tool 只读取当前会话中用户已经看到的 `visibleTrainingProposal` 事实，并将其作为当前 run 可消费事实导入；它不生成新的最终训练结构，不代表本轮已经完成编排、刷新、保存或渲染。

#### Scenario: read_recent 成功不代表最终训练输出完成
- **WHEN** `inspectVisibleTrainingProposals(operation = "read_recent")` 成功
- **THEN** model observation MUST 表达该结果只是导入当前 run 可消费事实
- **AND** observation MUST 表达最终训练结构仍必须由合法 `final_answer.visibleOutputs[]`、grounded `final_answer` 或后续合法 action 承载
- **AND** observation MUST NOT 暗示 runtime 会在 `final_answer` 后继续自动查询或生成训练结构

#### Scenario: 需要后续事实时继续合法 action
- **WHEN** read/import 后模型判断目标仍需要额外动作事实、section、处方或 schedule
- **THEN** 模型可见说明 MUST 引导 Planner 自主选择继续合法 `tool_call`、使用 `ask_user` 澄清或明确失败收口
- **AND** 模型可见说明 MUST NOT 要求固定调用 `searchExerciseResources`
- **AND** 模型可见说明 MUST NOT 把任意用户短句写成必须调用本 tool 或另一个 tool 的条件

#### Scenario: 业务名只出现在 tool 局部说明
- **WHEN** 本 change 涉及 `visibleTrainingProposal`、`inspectVisibleTrainingProposals` 或 `read_recent`
- **THEN** 这些业务名 MUST 只作为 tool manifest、schema description、observation projection、resource contract 或测试样例出现
- **AND** 通用 Agent core MUST NOT 因这些业务名新增语义分支
