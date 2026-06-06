## MODIFIED Requirements

### Requirement: visibleTrainingProposal 必须声明 kind 并满足对应结构
`visibleTrainingProposal.payload` SHALL 声明 `kind = "exercise_selection" | "routine" | "plan"`。系统 SHALL 按模型声明的 `kind` 校验结构自洽性；服务端 MUST NOT 通过用户自然语言关键词、正则、同义词表或固定短句模板替模型判断或改写 kind。模型可见合同 SHALL 要求用户可见正文与声明的 `kind` 保持一致。

#### Scenario: 用户要一套训练编排
- **WHEN** 模型判断用户目标需要一次可执行训练流程
- **THEN** `payload.kind` MUST 为 `routine`
- **AND** `payload.exerciseItems` MUST 包含 `warmup`、`training`、`stretch` 三类 section
- **AND** 每个动作项 MUST 包含 `exerciseId`、`section`、`order` 和 `prescription`
- **AND** `training` 动作 MUST 作为该编排的主训练动作
- **AND** payload MUST NOT 包含 `schedule`
- **AND** 用户可见 `content` MUST NOT 将该 `routine` 描述为多天、周期或每周训练计划

#### Scenario: 用户要多天计划
- **WHEN** 模型判断用户目标需要多天训练安排
- **THEN** `payload.kind` MUST 为 `plan`
- **AND** `payload.exerciseItems` MUST 满足 `routine` 的动作和处方结构
- **AND** 模型 MUST 在同一个 payload 上输出 `schedule`
- **AND** `schedule.assignments` MUST 只表达指定周期内哪些天训练、哪些天休息
- **AND** 模型 MUST NOT 在 `schedule` 中为每天内嵌不同的完整 `exerciseItems`
- **AND** 用户可见 `content` 中关于训练频次、周期、多天或一周安排的承诺 MUST 能由同一 payload 的 `schedule.assignments` 支撑

## ADDED Requirements

### Requirement: 单模板 plan 必须用 schedule 表达训练频次
`visibleTrainingProposal.payload.kind = "plan"` SHALL 表示一套可重复训练模板与周期日程的组合。`exerciseItems` SHALL 承载同一套 `warmup` / `training` / `stretch` 编排；`schedule.assignments` SHALL 承载周期内训练日和休息日。

#### Scenario: 每周训练计划使用 7 天 schedule
- **WHEN** 模型生成一周训练安排
- **THEN** `payload.kind` MUST 为 `plan`
- **AND** `payload.schedule.cycleLengthDays` SHOULD 为 `7`
- **AND** `payload.schedule.assignments` MUST 覆盖第 1 天到第 7 天
- **AND** `payload.schedule.assignments` MUST 使用 `training` 表达训练日
- **AND** `payload.schedule.assignments` MUST 使用 `rest` 表达休息日
- **AND** `payload.exerciseItems` MUST 继续表示同一套可重复训练模板

#### Scenario: 每周 N 练的训练日数量一致
- **WHEN** 用户目标提供明确的每周训练频次
- **AND** 模型选择输出 `kind = "plan"`
- **THEN** `schedule.assignments` 中 `type = "training"` 的数量 SHOULD 与该频次一致
- **AND** 如果模型无法在当前结构中可靠表达该频次，Planner SHOULD 继续合法 `tool_call`、`ask_user` 或失败收口
- **AND** 系统 MUST NOT 通过服务端读取用户原文来改写 `schedule.assignments`
