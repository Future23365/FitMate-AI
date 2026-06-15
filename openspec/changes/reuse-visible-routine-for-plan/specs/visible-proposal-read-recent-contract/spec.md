## ADDED Requirements

### Requirement: inspectVisibleTrainingProposals observation 必须表达历史事实派生字段边界
系统 SHALL 在 `inspectVisibleTrainingProposals` 成功导入历史 `visibleTrainingProposal` 事实后，向模型暴露安全压缩的派生字段摘要。该摘要 MUST 表达历史 fact 中哪些结构字段可以作为新的结构化训练结果事实来源，以及若要构造 `plan` 仍缺少哪些结构字段。Observation MUST NOT 输出业务 output kind 可行性、下一步 action 指令或固定 tool flow。

#### Scenario: routine fact 暴露可复用字段
- **WHEN** `inspectVisibleTrainingProposals(operation = "list_recent")` 成功返回包含 `proposalKind = "routine"` 的历史 fact
- **AND** 该 fact 的 `exerciseItems[]` 均包含 `exerciseId`、`section` 和 `prescription`
- **THEN** model-visible summary MUST 表达该 fact 可复用 `exerciseItems.exerciseId`
- **AND** model-visible summary MUST 表达该 fact 可复用 `exerciseItems.section`
- **AND** model-visible summary MUST 表达该 fact 可复用 `exerciseItems.prescription`
- **AND** model-visible summary MUST 表达若该 fact 没有 `schedule`，构造 `plan` 时缺少的结构字段是 `schedule`

#### Scenario: exercise_selection fact 不伪装成完整 plan 来源
- **WHEN** `inspectVisibleTrainingProposals(operation = "list_recent")` 成功返回包含 `proposalKind = "exercise_selection"` 的历史 fact
- **AND** 该 fact 的 `exerciseItems[]` 不包含 `prescription`
- **THEN** model-visible summary MUST 表达该 fact 可复用 `exerciseItems.exerciseId` 和 `exerciseItems.section`
- **AND** model-visible summary MUST 表达构造 `plan` 时仍缺少 `exerciseItems.prescription`
- **AND** model-visible summary MUST NOT 暗示该 fact 已经完整支撑可执行 `plan`

#### Scenario: 派生摘要不提供下一步 action
- **WHEN** `inspectVisibleTrainingProposals` 的 observation 暴露给 Planner
- **THEN** observation MUST NOT 包含 `supportsOutputKinds`
- **AND** observation MUST NOT 包含 `nextActionHints`
- **AND** observation MUST NOT 包含要求固定调用 `searchExerciseResources` 或固定调用 `submitVisibleTrainingProposal` 的文案
- **AND** observation MUST 表达新的 `visibleTrainingProposal` 仍必须由结构化收口 tool 和服务端 validator 校验
