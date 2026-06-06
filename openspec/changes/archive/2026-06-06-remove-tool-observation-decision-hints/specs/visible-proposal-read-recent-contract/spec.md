## MODIFIED Requirements

### Requirement: read_recent 成功 observation 必须表达正向可消费事实和覆盖边界
`inspectVisibleTrainingProposals(operation = "read_recent")` 成功后，模型可见 observation SHALL 表达导入的 `visible_training_proposal_fact` 是当前 run 的可消费训练事实来源。Observation MUST 同时表达可正向复用的动作事实、section coverage、`schedule` 是否存在等确定性事实和不可支撑边界；MUST NOT 输出业务 output kind 可行性、下一步 action 建议或固定 tool flow。

#### Scenario: read_recent 投影可复用动作事实
- **WHEN** `read_recent` 成功读取并导入 `visible_training_proposal_fact`
- **THEN** model observation MUST 包含可复用动作项的 `exerciseId`、`section`、`order` 和可安全展示的有限摘要
- **AND** 有限摘要 SHOULD 包含动作名称、主要肌群、器械和 `allowedSections`
- **AND** model observation MUST NOT 暴露完整数据库对象、完整历史 payload、secret 或跨用户 payload

#### Scenario: read_recent 投影 section coverage
- **WHEN** `read_recent` 成功读取并导入 `visible_training_proposal_fact`
- **THEN** model observation MUST 表达 `availableSections`
- **AND** model observation MUST 表达 `sectionSummary`
- **AND** 若资源缺少 `warmup` 或 `stretch`，model observation MUST 表达缺少这些 section 的确定性事实
- **AND** model observation MUST NOT 把 section coverage 派生成 `supportsOutputKinds`

#### Scenario: read_recent 投影 schedule 事实
- **WHEN** `read_recent` 成功读取并导入包含或不包含 `schedule` 的 `visible_training_proposal_fact`
- **THEN** model observation MAY 表达 `schedule` 的安全摘要或 `hasSchedule`
- **AND** model observation MUST NOT 因存在 `schedule` 而输出 `supportsOutputKinds: ["plan"]`
- **AND** model observation MUST NOT 因缺少 `schedule` 而输出 `supportsOutputKinds` 排除 `plan`

#### Scenario: read_recent 不把历史事实当成已生成新方案
- **WHEN** `read_recent` 成功导入历史可见事实
- **THEN** model observation MUST 表达该 tool 只读取并导入事实，不生成新的 `visibleTrainingProposal`
- **AND** 需要推送新方案时最终结构 MUST 仍由 `final_answer.visibleOutputs[]` 承载
- **AND** observation MUST NOT 要求固定调用 `searchExerciseResources` 或固定输出某个 `payload.kind`

#### Scenario: read_recent 不提供下一步 action hints
- **WHEN** `read_recent` observation 暴露给 Planner
- **THEN** observation MUST NOT 包含 `nextActionHints`
- **AND** observation MUST NOT 包含 `final_answer_with_visible_outputs`
- **AND** observation MUST NOT 包含 `continue_tool_call`
- **AND** observation MUST NOT 替 Planner 判断当前请求应保留、派生、调整、替换还是重新生成
