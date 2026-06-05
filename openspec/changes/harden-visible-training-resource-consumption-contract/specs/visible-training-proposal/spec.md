## ADDED Requirements

### Requirement: 从可见训练事实派生输出必须受资源覆盖能力约束
Planner SHALL 仅基于当前 run 可见且可消费的训练事实派生新的 `visibleTrainingProposal`。当可见事实只覆盖部分 section 时，Planner MUST NOT 输出超出该事实覆盖能力的最终结构，除非先通过可见 tool 获取缺失 section 的可消费动作事实。

#### Scenario: 历史 training 事实可作为主训练来源
- **WHEN** 当前 run 已通过 read/import tool 导入可访问的 `visible_training_proposal_fact`
- **AND** 该 fact 包含 `training` 动作事实
- **THEN** Planner MAY 将这些 `training` 动作作为新的 `visibleTrainingProposal` 主训练来源
- **AND** Planner MUST NOT 在用户目标不是替换或排除时默认丢弃这些动作
- **AND** Planner MUST NOT 把这些动作默认写入 `excludeExerciseIds`

#### Scenario: 只有 training 覆盖时不得伪造 routine
- **WHEN** 当前可消费训练事实只覆盖 `training`
- **AND** Planner 判断最终目标需要 `routine` 或 `plan`
- **THEN** Planner MUST 继续获取 `warmup` 和 `stretch` 的可消费动作事实、澄清、失败收口或输出当前事实可支撑的结构
- **AND** Planner MUST NOT 把 `allowedSections` 不包含 `warmup` 或 `stretch` 的动作放入这些 section
- **AND** 系统 MUST 在终态校验中拒绝超出 section 覆盖能力的输出

#### Scenario: 派生 exercise_selection 可只使用 training 事实
- **WHEN** 当前可消费训练事实只覆盖 `training`
- **AND** Planner 判断最终目标只需要一批可选主训练动作
- **THEN** Planner MAY 输出 `payload.kind = "exercise_selection"`
- **AND** `exerciseItems` MUST 只包含 `section = "training"` 的动作项
- **AND** `exercise_selection` MUST NOT 包含 `prescription` 或 `schedule`

### Requirement: 可见训练方案 facts 必须表达 output support
跨 run 导入的可见训练事实 SHALL 向模型表达它当前可以直接支撑哪些输出结构，以及生成更强结构还缺哪些事实。该表达 SHALL 作为模型可见 resource / observation 边界，而不是服务端语义分流。

#### Scenario: read/import 后表达 output support
- **WHEN** `visible_training_proposal_fact` 成功导入当前 run
- **THEN** model observation MUST 表达该事实当前覆盖的 section
- **AND** model observation MUST 表达可直接支撑的 `payload.kind`
- **AND** model observation MUST 表达若要生成 `routine` 或 `plan` 还缺少哪些 section

#### Scenario: output support 不替模型生成最终方案
- **WHEN** model observation 表达 output support
- **THEN** observation MUST NOT 直接生成 `visibleTrainingProposal`
- **AND** observation MUST NOT 指定固定 action、固定 tool 调用顺序或固定 `payload.kind`
- **AND** 最终结构仍 MUST 由 `final_answer.visibleOutputs[]` 承载并通过业务 validator 校验
