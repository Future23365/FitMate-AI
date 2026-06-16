## ADDED Requirements

### Requirement: plan 必须按可重复 routine template 组合
`visibleTrainingProposal.payload.kind = "plan"` SHALL 表示一个可重复 `routine template` 与周期 `schedule` 的组合。模型 SHALL 先在同一个 payload 的 `exerciseItems[]` 中构造可执行编排，包含可用的 `warmup`、`training`、`stretch` 动作项和每个动作项的 `prescription`；随后 SHALL 使用 `schedule.assignments` 表达该编排在周期内的 `training` / `rest` 日。系统 MUST NOT 通过服务端读取用户原文来替模型构造 routine template、选择 `payload.kind` 或改写 `schedule`。

#### Scenario: 一周计划直接提交 plan
- **WHEN** 用户目标需要一周、多天、周期、训练日或休息日安排
- **AND** 当前模型可见动作事实足以构造至少包含 `training` 的可重复 routine template
- **THEN** 模型 MUST 调用 `submitVisibleTrainingProposal` 提交 `payload.kind = "plan"`
- **AND** 同一个 payload 的 `exerciseItems[]` MUST 表达同一套可重复 routine template
- **AND** 同一个 payload 的每个 `exerciseItems[]` 动作项 MUST 包含 `prescription`
- **AND** 同一个 payload MUST 包含合法 `schedule`
- **AND** 模型 MUST NOT 只通过 `fitmate_final_response.content` 描述未校验 plan

#### Scenario: plan 不先暴露 routine 作为用户可见终态
- **WHEN** 用户目标明确需要 `plan`
- **AND** 模型在当前轮构造了可重复 routine template
- **THEN** 该 routine template MUST 作为同一个 `payload.kind = "plan"` 的 `exerciseItems[]` 出现
- **AND** 模型 MUST NOT 先把 `payload.kind = "routine"` 作为本轮用户可见最终结果，再依赖用户下一轮继续生成 plan
- **AND** 若当前事实不足以构造 plan，模型 MUST 继续合法 tool call、追问一个关键条件或失败收口

#### Scenario: schedule 只安排 template 的训练日
- **WHEN** 模型提交 `payload.kind = "plan"`
- **THEN** `schedule.assignments` MUST 只表达该 routine template 在周期内的 `training` / `rest` 日
- **AND** `schedule` MUST NOT 内嵌每天不同的完整 `exerciseItems`
- **AND** `schedule` MUST NOT 复制多套不同 routine

### Requirement: submitVisibleTrainingProposal 必须表达 plan composition 合同
`submitVisibleTrainingProposal` 的模型可见 tool description 和 schema description SHALL 表达：`payload.kind = "plan"` 是“可重复 routine template + schedule”。该说明 MUST 引导模型在动作候选事实足够时提交结构化 plan；`content` 只能解释已由 payload 承载并通过 validator 的计划事实，不能替代 `exerciseItems[]`、`prescription` 或 `schedule`。

#### Scenario: tool description 描述 plan composition
- **WHEN** production registry 序列化 `submitVisibleTrainingProposal` tool description
- **THEN** 模型可见说明 MUST 表达 `plan` 的 `exerciseItems[]` 表示同一套可重复 routine template
- **AND** 模型可见说明 MUST 表达 `plan` 的 `schedule.assignments` 只表达周期内 `training` / `rest` 日
- **AND** 模型可见说明 MUST 表达一周或多天 plan 不要求每天内嵌不同完整编排

#### Scenario: schema description 描述 plan composition
- **WHEN** production registry 序列化 `submitVisibleTrainingProposal` input schema description
- **THEN** `payload` 的 schema description MUST 表达 `kind=plan` 的 `exerciseItems[]` 表示同一套可重复 routine template
- **AND** `payload` 的 schema description MUST 表达 `schedule` 是该 template 的周期安排
- **AND** 该说明 MUST 保持 `payload.kind`、`exerciseItems[]`、`prescription`、`schedule` 等字段名英文原样
