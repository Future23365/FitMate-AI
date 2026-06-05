## ADDED Requirements

### Requirement: 明确 routine 目标不得以动作选择替代
从当前 run 可见动作事实派生 `visibleTrainingProposal` 时，模型若判断用户目标需要一次可执行 `routine`，系统 SHALL 要求最终结构使用 `payload.kind = "routine"` 并包含 `warmup`、`training`、`stretch` 三类动作与处方。模型 MUST NOT 用 `payload.kind = "exercise_selection"`、正文动作列表或“用户自行组合”的说明替代明确 routine 目标。

#### Scenario: 候选足够时输出 routine
- **WHEN** 当前 run 已有可消费 `training`、`warmup`、`stretch` 动作事实
- **AND** 模型判断用户目标需要一次可执行 routine
- **THEN** 模型 MUST 输出 `final_answer.visibleOutputs[]` 中的 `visibleTrainingProposal.payload.kind = "routine"`
- **AND** payload MUST 包含三类 section 的 `exerciseItems`
- **AND** 每个动作项 MUST 包含可校验的 `prescription`

#### Scenario: 候选不足时不输出动作列表冒充 routine
- **WHEN** 模型判断用户目标需要一次可执行 routine
- **AND** 当前 run 缺少 `warmup`、`training` 或 `stretch` 中任一 section 的可消费动作事实
- **THEN** 模型 MUST NOT 输出 `payload.kind = "exercise_selection"` 来冒充完整 routine
- **AND** 模型 MUST NOT 只在 `content` 中给出动作列表、组数或循环建议并要求用户自行组合
- **AND** 模型 MUST 继续获取缺失事实、使用 `ask_user` 澄清，或使用不带 `visibleOutputs` 的 `final_answer` 说明缺口和下一步

#### Scenario: 服务端不改写 kind
- **WHEN** 模型输出 `visibleTrainingProposal.payload.kind`
- **THEN** 服务端 MUST 按模型声明的 kind 执行结构、权限、数据库事实和 resource 边界校验
- **AND** 服务端 MUST NOT 根据用户自然语言把 `exercise_selection` 改写成 `routine`
- **AND** 服务端 MUST NOT 根据用户自然语言替模型补动作、补处方或补 section
