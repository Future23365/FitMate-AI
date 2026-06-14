## MODIFIED Requirements

### Requirement: visibleTrainingProposal 必须声明 kind 并满足对应结构
`visibleTrainingProposal.payload` SHALL 声明 `kind = "exercise_selection" | "routine" | "plan"`。系统 SHALL 按模型声明的 `kind` 校验结构自洽性；服务端 MUST NOT 通过用户自然语言关键词、正则、同义词表或固定短句模板替模型判断或改写 kind。模型可见合同 SHALL 要求用户可见正文与声明的 `kind` 保持一致：`exercise_selection` 的正文只解释动作推荐集合，不主动输出组数、次数、时长、休息时间、训练频率、日程或等价处方参数；`routine` / `plan` 的处方型正文必须能由对应 payload 的 `prescription` / `schedule` 支撑。模型可见合同 SHALL 正向引导 `routine` / `plan` 优先包含热身、主训练和拉伸。

#### Scenario: 用户只要动作推荐
- **WHEN** 模型判断用户目标只需要动作推荐集合
- **THEN** `payload.kind` MAY 为 `exercise_selection`
- **AND** `payload.exerciseItems` MUST 包含可被服务端复核的动作事实
- **AND** payload MUST NOT 包含 `prescription` 或 `schedule`
- **AND** 用户可见 `content` MUST NOT 主动生成组数、次数、时长、休息时间、训练频率、日程或等价处方参数
- **AND** 用户可见 `content` MAY 解释推荐理由、目标肌群、适用场景、动作差异、动作注意事项或与用户目标的关系

#### Scenario: 用户要一套训练编排
- **WHEN** 模型判断用户目标需要一次可执行训练流程
- **THEN** `payload.kind` MUST 为 `routine`
- **AND** `payload.exerciseItems` MUST 至少包含 `training` section
- **AND** 模型可见合同 MUST 引导模型优先补充 `warmup` 和 `stretch` section
- **AND** 每个动作项 MUST 包含 `exerciseId`、`section`、`order` 和 `prescription`
- **AND** `training` 动作 MUST 作为该编排的主训练动作
- **AND** payload MUST NOT 包含 `schedule`
- **AND** 用户可见 `content` MUST NOT 将该 `routine` 描述为多天、周期或每周训练计划

#### Scenario: 用户要多天计划
- **WHEN** 模型判断用户目标需要多天训练安排
- **THEN** `payload.kind` MUST 为 `plan`
- **AND** `payload.exerciseItems` MUST 至少包含 `training` section 和处方
- **AND** 模型可见合同 MUST 引导模型优先补充 `warmup` 和 `stretch` section
- **AND** 模型 MUST 在同一个 payload 上输出 `schedule`
- **AND** `schedule.assignments` MUST 只表达指定周期内哪些天训练、哪些天休息
- **AND** 模型 MUST NOT 在 `schedule` 中为每天内嵌不同的完整 `exerciseItems`
- **AND** 用户可见 `content` 中关于训练频次、周期、多天或一周安排的承诺 MUST 能由同一 payload 的 `schedule.assignments` 支撑

### Requirement: 编排处方必须绑定到动作项并对齐执行字段
`visibleTrainingProposal.payload.exerciseItems[*].prescription` SHALL 只在 `kind = "routine"` 或 `kind = "plan"` 时出现，并 SHALL 与同一个动作项绑定。系统 MUST NOT 使用独立的处方数组、按 index join 的处方表、`restSeconds` 主合同字段或正文描述作为动作执行参数事实源。对于 `kind = "exercise_selection"`，用户可见正文中的组数、次数、时长、休息时间、训练频率、日程或等价表达同样 MUST NOT 被视为合法处方事实源。

#### Scenario: 编排动作包含处方
- **WHEN** `visibleTrainingProposal.payload.kind` 为 `routine` 或 `plan`
- **THEN** 每个 `exerciseItems` 动作项 MUST 包含 `prescription.mode`
- **AND** 每个 `prescription.mode` MUST 只能是 `reps` 或 `duration`
- **AND** 每个处方 MUST 包含 `sets` 和 `target`
- **AND** 每个处方 MUST 包含 `setRestSeconds` 和 `transitionRestSeconds`
- **AND** 数值边界 MUST 对齐当前训练草稿或执行模型的确定性 schema

#### Scenario: 推荐动作不需要处方
- **WHEN** `visibleTrainingProposal.payload.kind` 为 `exercise_selection`
- **THEN** 服务端 MUST 接受缺少 `prescription` 的 `training` 动作项
- **AND** payload MUST NOT 包含 `prescription` 或 `schedule`
- **AND** 用户可见 `content` MUST NOT 主动输出组数、次数、时长、休息时间、训练频率、日程或等价处方参数
- **AND** visible training proposal renderer / response adapter MUST 将该结果渲染为动作推荐而不是可执行编排

#### Scenario: 处方与动作分离
- **WHEN** 模型输出独立处方数组、正文处方、`restSeconds` 主合同字段或无法确定归属动作的执行参数
- **THEN** 服务端 MUST NOT 将这些内容作为 `visibleTrainingProposal` 的处方事实
- **AND** runtime MUST 进入结构化 repair、澄清或失败收口
