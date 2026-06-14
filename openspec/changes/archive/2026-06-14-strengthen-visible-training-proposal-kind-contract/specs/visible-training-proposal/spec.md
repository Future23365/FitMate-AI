## ADDED Requirements

### Requirement: 模型可见合同必须互斥表达 visibleTrainingProposal kind 选择
`submitVisibleTrainingProposal` 的模型可见 tool description 和 schema description SHALL 用互斥、可判别的方式表达 `visibleTrainingProposal.payload.kind` 的选择边界。该说明 MUST 帮助模型根据用户目标、上下文和已获得事实区分纯动作推荐、单次可执行训练和多天训练计划；系统 MUST NOT 通过服务端关键词、正则、同义词表或固定短句模板替模型选择或改写 `payload.kind`。

#### Scenario: 纯动作推荐使用 exercise_selection
- **WHEN** 模型要向用户展示一组主训练动作推荐
- **AND** 该输出不承诺组数、次数、时长、休息、热身、拉伸、训练日或周期安排
- **THEN** 模型可见合同 MUST 表达 `payload.kind = "exercise_selection"` 可用于该结构
- **AND** 模型可见合同 MUST 表达 `exercise_selection` 的 `exerciseItems[*].section` 只能是 `training`
- **AND** 模型可见合同 MUST 表达 `exercise_selection` 不包含 `prescription` 或 `schedule`

#### Scenario: 单次可执行训练使用 routine
- **WHEN** 模型要交付单次可执行训练结构
- **THEN** 模型可见合同 MUST 表达 `payload.kind = "routine"` 用于该结构
- **AND** 模型可见合同 MUST 表达 `routine` 可以包含 `warmup`、`training` 和 `stretch`
- **AND** 模型可见合同 MUST 表达 `routine` 至少需要 `training` 动作项
- **AND** 模型可见合同 MUST 表达 `routine` 的每个 `exerciseItems[]` 动作项都必须包含 `prescription`
- **AND** 模型可见合同 MUST 表达 `routine` 不包含 `schedule`

#### Scenario: 多天训练计划使用 plan
- **WHEN** 模型要交付多天、周期、训练日或休息日安排
- **THEN** 模型可见合同 MUST 表达 `payload.kind = "plan"` 用于该结构
- **AND** 模型可见合同 MUST 表达 `plan` 的每个 `exerciseItems[]` 动作项都必须包含 `prescription`
- **AND** 模型可见合同 MUST 表达 `plan` 必须包含 `schedule`
- **AND** 模型可见合同 MUST 表达 `schedule` 只表达同一套编排在周期内的训练日和休息日

#### Scenario: 支持 section 不得塞进 exercise_selection
- **WHEN** 模型准备提交的结构包含 `warmup` 或 `stretch` 动作项
- **THEN** 模型可见合同 MUST 表达这些动作项不得放入 `exercise_selection`
- **AND** 模型可见合同 MUST 引导模型选择能承载可执行编排的 `routine` 或 `plan`
- **AND** 该说明 MUST NOT 写成针对某个用户原话或短句的触发规则
