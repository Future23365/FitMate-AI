## ADDED Requirements

### Requirement: routine 和 plan final 输出必须受 section readiness 约束
从当前 run 可见训练事实派生 `visibleTrainingProposal` 时，Planner SHALL 在输出 `routine` 或 `plan` 的 `final_answer.visibleOutputs[]` 前确认当前可消费动作事实已经覆盖 `warmup`、`training`、`stretch` 三类 section。若 section coverage 不足，Planner MUST 先获取缺失事实、澄清、失败收口，或只输出当前事实可支撑的结构。服务端 SHALL 继续只校验结构、权限、数据库事实和 resource 边界，MUST NOT 根据用户自然语言替模型补动作或改写 `payload.kind`。

#### Scenario: 缺 section 时不得提交 routine 或 plan visibleOutputs
- **WHEN** 当前 run 可消费动作事实缺少 `warmup`、`training` 或 `stretch` 中任一 section
- **AND** Planner 判断最终目标需要 `routine` 或 `plan`
- **THEN** Planner MUST NOT 输出 `final_answer.visibleOutputs[]` 中的 `payload.kind = "routine"` 或 `"plan"`
- **AND** Planner MUST NOT 在 `content` 中说明缺少某个 section 后仍提交不完整的 `routine` 或 `plan`
- **AND** Planner MUST 先获取缺失 section 的可消费动作事实、使用 `ask_user` 澄清、失败收口，或不输出 `visibleOutputs` 并说明当前事实不足

#### Scenario: 缺 section 时可以输出当前事实可支撑结构
- **WHEN** 当前 run 可消费动作事实只覆盖 `training`
- **AND** Planner 判断最终目标只需要一批可选主训练动作
- **THEN** Planner MAY 输出 `payload.kind = "exercise_selection"`
- **AND** `exerciseItems` MUST 只包含 `section = "training"` 的动作项
- **AND** `exercise_selection` MUST NOT 包含 `prescription` 或 `schedule`

#### Scenario: AI 仍负责选择动作和编排
- **WHEN** 当前 run 缺少 `warmup` 或 `stretch`，且模型目标需要 `routine` 或 `plan`
- **THEN** 系统 MUST 通过模型可见 prompt、tool manifest、observation 或 repair feedback 引导 Planner 获取缺失 section 的动作事实
- **AND** 服务端 MUST NOT 自动选择 `warmup` 或 `stretch` 动作补入最终 payload
- **AND** 服务端 MUST NOT 根据用户原文关键词、短句模板、同义词表或固定 phrasing 改写模型的 tool 调用、动作选择或 `payload.kind`

#### Scenario: 终态 validator 保持硬拦截
- **WHEN** Planner 仍提交缺少必要 section 的 `payload.kind = "routine"` 或 `"plan"`
- **THEN** 业务 terminal output validator MUST 拒绝该 `visibleTrainingProposal`
- **AND** 系统 MUST NOT 渲染或保存该不完整训练方案
- **AND** repair feedback MAY 提醒 Planner 不要再次提交缺 section 的 `routine` 或 `plan`
- **AND** repair feedback MUST NOT 成为表达 section readiness 的唯一模型可见合同
