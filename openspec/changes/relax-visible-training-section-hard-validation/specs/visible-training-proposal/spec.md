## MODIFIED Requirements

### Requirement: visibleTrainingProposal 必须声明 kind 并满足对应结构
`visibleTrainingProposal.payload` SHALL 声明 `kind = "exercise_selection" | "routine" | "plan"`。系统 SHALL 按模型声明的 `kind` 校验结构自洽性；服务端 MUST NOT 通过用户自然语言关键词、正则、同义词表或固定短句模板替模型判断或改写 kind。模型可见合同 SHALL 要求用户可见正文与声明的 `kind` 保持一致，并正向引导 `routine` / `plan` 优先包含热身、主训练和拉伸。

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

### Requirement: 训练方案生成必须遵循分阶段动作证据流程
Agent SHALL 基于当前可见事实、tool manifest、observations、用户目标和模型自主推理组合 `visibleTrainingProposal`。主训练动作 SHALL 先被确定；热身和拉伸 SHOULD 围绕已确定的主训练动作补充；`routine` SHALL 至少由 `training` 动作和处方组成，并 SHOULD 包含 `warmup` / `stretch`；`plan` SHALL 在同一套编排上增加 `schedule.assignments`。系统 MUST NOT 用服务端规则、固定关键词、固定工具调用次数或固定工具调用顺序替代模型决策；但模型可见合同 MUST 阻止 `routine` / `plan` 目标在可继续补事实时降级成纯动作推荐。

#### Scenario: 只推荐动作
- **WHEN** 用户目标只需要动作推荐
- **THEN** Agent MUST 查询或复用 `training` 相关候选证据
- **AND** Agent SHOULD NOT 为该目标额外查询 `warmup` / `stretch`
- **AND** 最终 `visibleTrainingProposal.payload.kind` MAY 为 `exercise_selection`
- **AND** payload MUST NOT 包含 `prescription` 或 `schedule`

#### Scenario: 直接生成编排
- **WHEN** 用户目标需要一次可执行编排
- **AND** 当前上下文没有可复用的 `training` 动作
- **THEN** Agent MUST 先查询并确定 `training` 动作证据
- **AND** Agent SHOULD 再查询或选择 `suitabilities = ["warmup", "stretch"]` 的候选
- **AND** 后续查询 SHOULD 基于已确定的主训练动作和用户目标补充结构
- **AND** 最终 `visibleTrainingProposal.payload.kind` MUST 为 `routine`
- **AND** 最终 payload MUST 至少包含 `training` section 的 `exerciseItems`
- **AND** 每个动作项 MUST 绑定 `prescription`

#### Scenario: 直接生成多天计划
- **WHEN** 用户目标需要周期、多天、频次、训练日 / 休息日安排或跨天训练计划
- **AND** 当前上下文没有可复用的完整 `routine` 或 `plan`
- **THEN** Agent MUST 先查询并确定 `training` 动作证据
- **AND** Agent SHOULD 再查询或选择 `warmup` / `stretch` 动作证据
- **AND** Agent SHOULD 将 `warmup`、`training`、`stretch` 三类动作组合成同一套带 `prescription` 的编排
- **AND** Agent MUST 在同一个 `visibleTrainingProposal.payload` 中输出 `schedule`
- **AND** 最终 `visibleTrainingProposal.payload.kind` MUST 为 `plan`
- **AND** `schedule.assignments` MUST 表达周期内 `training` / `rest` 日
- **AND** `schedule` MUST NOT 内嵌每天不同的完整动作编排

#### Scenario: 基于上一轮动作生成编排
- **WHEN** 当前上下文已有可访问的 `visibleTrainingProposal.training` 动作
- **AND** 用户要求基于这些动作编排训练
- **THEN** Agent MUST 复用已有 `training` 动作
- **AND** Agent SHOULD 只补充 `warmup` / `stretch` 候选，除非用户明确要求替换主训练动作
- **AND** Agent MUST NOT 在用户未要求替换时丢弃上一轮 `training` 动作

#### Scenario: 基于已有编排生成计划
- **WHEN** 当前上下文已有包含 `training` 和 `prescription` 的 `visibleTrainingProposal`
- **AND** 用户要求多天计划
- **THEN** Agent MUST 复用该编排
- **AND** Agent SHOULD 在已有 support section 不足时优先补充 `warmup` / `stretch`
- **AND** Agent MUST 生成或调整 `schedule`
- **AND** Agent MUST NOT 因生成计划而重新查询或替换动作，除非用户明确要求调整动作

#### Scenario: plan 或 routine 目标不得降级为 exercise_selection
- **WHEN** 模型根据用户目标、上下文和可见合同判断最终结构应为 `routine` 或 `plan`
- **AND** 当前 run 只具备 `training` 动作事实
- **AND** 当前可见 tools 可继续查询缺失的 `warmup` / `stretch` 动作事实
- **THEN** Agent SHOULD 优先继续查询或选择缺失 section 的动作事实
- **AND** Agent MUST NOT 因当前只查到 `training` 动作就输出 `payload.kind = "exercise_selection"` 来替代 `routine` 或 `plan`
- **AND** Agent MUST NOT 把 `content` 中的自然语言处方或计划说明当作结构事实源

#### Scenario: plan 事实不足时不伪造结构
- **WHEN** 用户目标需要 `plan`
- **AND** 当前可见 tools 不可用、必要约束不足或动作事实无法支撑合法结构
- **THEN** Agent MUST 使用 `ask_user`、失败收口或不伪造结构事实的解释
- **AND** Agent MUST NOT 编造未获得的 `exerciseId`
- **AND** Agent MUST NOT 把 `groups.training` 中且 `allowedSections` 不包含 `warmup` / `stretch` 的动作写入 `warmup` 或 `stretch`
- **AND** Agent MUST NOT 输出缺少 `training` 事实但伪装成功的 `plan`

### Requirement: routine 和 plan final 输出必须受 section readiness 约束
从当前 run 可见训练事实派生 `visibleTrainingProposal` 时，Planner SHALL 在输出 `routine` 或 `plan` 的 `final_answer.visibleOutputs[]` 前确认当前可消费动作事实至少覆盖 `training` section，并 SHOULD 优先覆盖 `warmup`、`training`、`stretch` 三类 section。若 `training` coverage 不足，Planner MUST 先获取缺失事实、澄清、失败收口，或只输出当前事实可支撑的结构。服务端 SHALL 继续只校验结构、权限、数据库事实和 resource 边界，MUST NOT 根据用户自然语言替模型补动作或改写 `payload.kind`。

#### Scenario: 缺 training 时不得提交 routine 或 plan visibleOutputs
- **WHEN** 当前 run 可消费动作事实缺少 `training` section
- **AND** Planner 判断最终目标需要 `routine` 或 `plan`
- **THEN** Planner MUST NOT 输出 `final_answer.visibleOutputs[]` 中的 `payload.kind = "routine"` 或 `"plan"`
- **AND** Planner MUST NOT 在 `content` 中说明缺少主训练后仍提交不完整的 `routine` 或 `plan`
- **AND** Planner MUST 先获取 `training` 的可消费动作事实、使用 `ask_user` 澄清、失败收口，或不输出 `visibleOutputs` 并说明当前事实不足

#### Scenario: 缺 support section 时应优先补齐
- **WHEN** 当前 run 可消费动作事实覆盖 `training`，但缺少 `warmup` 或 `stretch`
- **AND** Planner 判断最终目标需要 `routine` 或 `plan`
- **AND** 当前可见 tools 可继续查询缺失 support section
- **THEN** Planner SHOULD 优先继续获取缺失 support section 的动作事实
- **AND** Planner MUST NOT 把 `allowedSections` 不包含 `warmup` 或 `stretch` 的动作放入这些 section
- **AND** Planner MUST NOT 把正文中的热身或拉伸说明当作结构化动作事实

#### Scenario: 缺 support section 时不触发终态硬拦截
- **WHEN** Planner 提交 `payload.kind = "routine"` 或 `"plan"`
- **AND** `payload.exerciseItems` 覆盖合法 `training` section
- **AND** `payload.exerciseItems` 缺少 `warmup` 或 `stretch`
- **THEN** 业务 terminal output validator MUST NOT 因 support section 缺失拒绝该 `visibleTrainingProposal`
- **AND** 系统 MUST 继续校验 payload schema、数据库动作事实、发布态、权限、`allowedSections`、`prescription` 和 `schedule`
- **AND** 系统 MUST NOT 自动选择或补入缺失 support section 动作
