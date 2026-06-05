## ADDED Requirements

### Requirement: read_recent 成功 observation 必须表达正向可消费事实和覆盖边界
`inspectVisibleTrainingProposals(operation = "read_recent")` 成功后，模型可见 observation SHALL 表达导入的 `visible_training_proposal_fact` 是当前 run 的可消费训练事实来源。Observation MUST 同时表达可正向复用的动作事实、section coverage、output support 和不可支撑边界。

#### Scenario: read_recent 投影可复用动作事实
- **WHEN** `read_recent` 成功读取并导入 `visible_training_proposal_fact`
- **THEN** model observation MUST 包含可复用动作项的 `exerciseId`、`section`、`order` 和可安全展示的有限摘要
- **AND** 有限摘要 SHOULD 包含动作名称、主要肌群、器械和 `allowedSections`
- **AND** model observation MUST NOT 暴露完整数据库对象、完整历史 payload、secret 或跨用户 payload

#### Scenario: read_recent 投影 section coverage
- **WHEN** `read_recent` 成功读取并导入 `visible_training_proposal_fact`
- **THEN** model observation MUST 表达 `availableSections`
- **AND** model observation MUST 表达 `sectionSummary`
- **AND** 若资源缺少 `warmup` 或 `stretch`，model observation MUST 表达生成 `routine` 或 `plan` 仍缺少这些 section

#### Scenario: read_recent 不把历史事实当成已生成新方案
- **WHEN** `read_recent` 成功导入历史可见事实
- **THEN** model observation MUST 表达该 tool 只读取并导入事实，不生成新的 `visibleTrainingProposal`
- **AND** 需要推送新方案时最终结构 MUST 仍由 `final_answer.visibleOutputs[]` 承载
- **AND** observation MUST NOT 要求固定调用 `searchExerciseResources` 或固定输出某个 `payload.kind`

### Requirement: read_recent observation 必须区分保留、排除和替换边界
`read_recent` 的模型可见说明 SHALL 表达导入事实可以用于保留、复用、派生、调整、排除或替换，但这些操作由 Planner 基于用户目标和可见事实自主判断。系统 MUST NOT 将导入事实默认转换为排除列表。

#### Scenario: 导入事实默认是可消费来源
- **WHEN** `read_recent` 成功导入事实
- **THEN** model observation MUST 表达导入动作可作为正向事实来源
- **AND** model observation MUST 表达只有替换、排除或避免重复目标才适合把这些动作作为负向排除约束
- **AND** model observation MUST NOT 表达成导入后默认调用带 `excludeExerciseIds` 的动作查询

#### Scenario: read_recent 不做语义判断
- **WHEN** `read_recent` observation 暴露给 Planner
- **THEN** observation MUST NOT 包含固定用户短语作为使用条件
- **AND** observation MUST NOT 包含答案模板
- **AND** observation MUST NOT 替 Planner 判断当前请求是保留、派生、调整还是替换
