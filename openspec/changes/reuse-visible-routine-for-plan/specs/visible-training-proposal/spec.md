## ADDED Requirements

### Requirement: visibleTrainingProposal 可以复用已导入历史训练事实
系统 SHALL 允许模型基于当前 run 已导入且当前用户可访问的历史 `visibleTrainingProposal` 事实构造新的 `visibleTrainingProposal`。模型可见合同 MUST 表达历史 fact 中的 `exerciseItems.exerciseId`、`exerciseItems.section` 和 `exerciseItems.prescription` 可以作为新的 `routine` 或 `plan` 的事实来源；服务端 validator MUST 继续校验结构、数据库动作事实、section、prescription 和 schedule。

#### Scenario: 从完整 routine 派生 plan
- **WHEN** 当前 run 已通过 `inspectVisibleTrainingProposals` 导入一个包含 `training` section 且每个 `exerciseItems[]` 都有 `prescription` 的历史 `routine` fact
- **AND** 模型构造新的 `visibleTrainingProposal.payload.kind = "plan"`
- **THEN** 模型 MAY 复用该历史 fact 中的 `exerciseItems.exerciseId`
- **AND** 模型 MAY 复用该历史 fact 中的 `exerciseItems.section`
- **AND** 模型 MAY 复用该历史 fact 中的 `exerciseItems.prescription`
- **AND** 模型 MUST 在新的 payload 中提供合法 `schedule`
- **AND** 服务端 MUST 按现有 validator 校验该 payload

#### Scenario: schedule 来源由结构合同校验
- **WHEN** 模型构造 `visibleTrainingProposal.payload.kind = "plan"`
- **THEN** 模型可见合同 MUST 表达 `schedule` 可以由模型基于本轮用户目标、明确周期、训练日 / 休息日安排或保守默认生成
- **AND** 模型可见合同 MUST 表达 `schedule` 不要求来自动作库查询结果
- **AND** 服务端 MUST 继续校验 `schedule.cycleLengthDays`、`schedule.assignments` 覆盖范围和枚举值

#### Scenario: 历史 fact 不绕过 validator
- **WHEN** 模型复用历史 `visibleTrainingProposal` fact 构造新的 `routine` 或 `plan`
- **THEN** `submitVisibleTrainingProposal` MUST 仍校验 payload 的 kind、exerciseItems、prescription、schedule 和数据库动作事实
- **AND** 系统 MUST NOT 因历史 fact 可复用而跳过服务端 validator
- **AND** 系统 MUST NOT 从历史 assistant 自然语言正文反向构造动作、处方或 schedule
