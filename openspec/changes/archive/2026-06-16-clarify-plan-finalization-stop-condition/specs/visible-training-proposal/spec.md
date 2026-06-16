## ADDED Requirements

### Requirement: submitVisibleTrainingProposal 必须表达 prescription 的模型构造边界
系统 SHALL 在 `submitVisibleTrainingProposal` 的 tool description、schema description 或等价模型可见说明中表达：`payload.kind = "routine"` 或 `"plan"` 的 `prescription` 可由模型基于本轮用户目标、动作候选事实、单次训练时长和保守训练编排构造。系统 MUST 继续通过 schema 与服务端 validator 校验 `prescription`、`schedule`、动作数据库事实和结构边界。

#### Scenario: routine 或 plan prescription 来源说明
- **WHEN** production registry 序列化 `submitVisibleTrainingProposal` tool description
- **THEN** 模型可见说明 MUST 表达 `payload.kind = "routine"` 或 `"plan"` 的 `prescription` 不要求来自动作库查询结果
- **AND** 模型可见说明 MUST 表达 `prescription` 可由模型基于本轮用户目标、训练频率、单次时长、动作候选事实和保守训练编排常识生成
- **AND** 模型可见说明 MUST 表达 `prescription` 必须绑定在对应 `exerciseItems[]` 动作项上
- **AND** 模型可见说明 MUST 表达服务端 validator 仍会校验结构和确定性边界

#### Scenario: plan schedule 来源说明
- **WHEN** production registry 序列化 `submitVisibleTrainingProposal` tool description
- **THEN** 模型可见说明 MUST 表达 `payload.kind = "plan"` 的 `schedule` 可以由模型基于本轮用户目标、明确周期、训练日 / 休息日安排或保守默认生成
- **AND** 模型可见说明 MUST 表达 `schedule` 不要求来自动作库查询结果
- **AND** 模型可见说明 MUST 表达 `schedule` 必须符合 schema 并通过服务端 validator

#### Scenario: 不让 finalization tool 生成业务字段
- **WHEN** 模型调用 `submitVisibleTrainingProposal`
- **THEN** 该 tool MUST 只校验模型已经构造好的 `visibleTrainingProposal`
- **AND** 该 tool MUST NOT 自动生成动作、`prescription`、`schedule`、`routine` 或 `plan`
- **AND** 该 tool MUST NOT 保存训练计划或写入用户数据
