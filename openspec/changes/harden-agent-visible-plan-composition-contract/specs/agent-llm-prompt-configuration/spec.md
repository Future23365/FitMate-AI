## ADDED Requirements

### Requirement: Agent LLM prompt 必须表达多天计划组合路径
系统 SHALL 在默认 Agent LLM prompt 中为 `visibleTrainingProposal.payload.kind = "plan"` 提供模型可见的结构选择和组合顺序说明。Prompt MUST 引导模型根据用户目标、上下文、可见 tools、observations 和 tool results 自主判断训练输出结构；系统 MUST NOT 根据用户原文关键词、正则、同义词表或短句模板替模型选择或改写 `payload.kind`。

#### Scenario: Prompt 描述 plan 的结构选择边界
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明当用户目标需要周期、多天、频次、训练日 / 休息日安排或跨天训练计划时，模型应优先使用 `payload.kind = "plan"`
- **AND** system message MUST 说明这是一条训练输出结构选择规则，不是固定词语触发规则
- **AND** system message MUST 说明服务端只校验模型声明的结构、权限和数据库事实，不会根据用户原文替模型改写 `kind`
- **AND** system message MUST 继续说明只需要一批可选训练动作时使用 `payload.kind = "exercise_selection"`

#### Scenario: Prompt 描述 plan 的生成顺序
- **WHEN** 默认 prompt 描述 `payload.kind = "plan"`
- **THEN** system message MUST 说明模型应先确认或使用当前可见的训练目标、限制、器械、时间和难度
- **AND** system message MUST 说明模型应查询或复用 `training` 动作事实作为主训练动作来源
- **AND** system message MUST 说明当前 run 缺少可消费 `warmup` 或 `stretch` 动作事实时，应优先使用可见 tool 查询缺失 section
- **AND** system message MUST 说明 `plan` 的 `exerciseItems` 必须组成同一套 `warmup` / `training` / `stretch` 编排，并为每个动作项绑定 `prescription`
- **AND** system message MUST 说明 `plan` 必须用 `schedule.assignments` 表达周期内 `training` / `rest` 日
- **AND** system message MUST 说明 `schedule` 不得内嵌每天不同的完整动作编排

#### Scenario: Prompt 禁止 plan 或 routine 目标降级为纯动作推荐
- **WHEN** 模型判断用户目标需要 `routine` 或 `plan`
- **AND** 当前 run 只具备 `training` 动作事实
- **AND** 当前可见 tools 支持继续查询缺失 section
- **THEN** system message MUST 引导模型优先继续查询缺失的 `warmup` / `stretch` 动作事实
- **AND** system message MUST 说明不得因为只查到了 `training` 动作就输出 `payload.kind = "exercise_selection"` 来替代 `routine` 或 `plan`
- **AND** system message MUST 说明如果 tool 不可用、事实仍不足或用户目标缺少必要约束，模型应使用 `ask_user`、失败收口或仅输出不伪造结构事实的说明

#### Scenario: Prompt 不把 repair feedback 当作主合同
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 在首轮可见合同中表达 plan 组合路径和禁止降级边界
- **AND** system message MUST NOT 只依赖 validation failure 或 repair feedback 才向模型说明 plan 需要补齐 `warmup` / `stretch` 和 `schedule`
- **AND** system message MUST NOT 要求模型调用未注册 tool 或隐藏训练生成服务
