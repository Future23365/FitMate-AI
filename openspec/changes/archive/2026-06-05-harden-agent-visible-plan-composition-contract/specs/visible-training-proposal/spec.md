## MODIFIED Requirements

### Requirement: 训练方案生成必须遵循分阶段动作证据流程
Agent SHALL 基于当前可见事实、tool manifest、observations、用户目标和模型自主推理组合 `visibleTrainingProposal`。主训练动作 SHALL 先被确定；热身和拉伸 SHALL 围绕已确定的主训练动作补充；`routine` SHALL 由 `warmup` / `training` / `stretch` 三类动作和处方组成；`plan` SHALL 在同一套编排上增加 `schedule.assignments`。系统 MUST NOT 用服务端规则、固定关键词、固定工具调用次数或固定工具调用顺序替代模型决策；但模型可见合同 MUST 阻止 `routine` / `plan` 目标在可继续补事实时降级成纯动作推荐。

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
- **AND** Agent MUST 再查询或选择 `suitabilities = ["warmup", "stretch"]` 的候选
- **AND** 后续查询 MUST 基于已确定的主训练动作和用户目标补充结构
- **AND** 最终 `visibleTrainingProposal.payload.kind` MUST 为 `routine`
- **AND** 最终 payload MUST 包含 `warmup`、`training`、`stretch` 三类 `exerciseItems`
- **AND** 每个动作项 MUST 绑定 `prescription`

#### Scenario: 直接生成多天计划
- **WHEN** 用户目标需要周期、多天、频次、训练日 / 休息日安排或跨天训练计划
- **AND** 当前上下文没有可复用的完整 `routine` 或 `plan`
- **THEN** Agent MUST 先查询并确定 `training` 动作证据
- **AND** Agent MUST 再查询或选择 `warmup` / `stretch` 动作证据
- **AND** Agent MUST 将 `warmup`、`training`、`stretch` 三类动作组合成同一套带 `prescription` 的编排
- **AND** Agent MUST 在同一个 `visibleTrainingProposal.payload` 中输出 `schedule`
- **AND** 最终 `visibleTrainingProposal.payload.kind` MUST 为 `plan`
- **AND** `schedule.assignments` MUST 表达周期内 `training` / `rest` 日
- **AND** `schedule` MUST NOT 内嵌每天不同的完整动作编排

#### Scenario: 基于上一轮动作生成编排
- **WHEN** 当前上下文已有可访问的 `visibleTrainingProposal.training` 动作
- **AND** 用户要求基于这些动作编排训练
- **THEN** Agent MUST 复用已有 `training` 动作
- **AND** Agent MUST 只补充 `warmup` / `stretch` 候选，除非用户明确要求替换主训练动作
- **AND** Agent MUST NOT 在用户未要求替换时丢弃上一轮 `training` 动作

#### Scenario: 基于已有编排生成计划
- **WHEN** 当前上下文已有包含 `warmup`、`training`、`stretch` 和 `prescription` 的 `visibleTrainingProposal`
- **AND** 用户要求多天计划
- **THEN** Agent MUST 复用该编排
- **AND** Agent MUST 只生成或调整 `schedule`
- **AND** Agent MUST NOT 因生成计划而重新查询或替换动作，除非用户明确要求调整动作

#### Scenario: plan 或 routine 目标不得降级为 exercise_selection
- **WHEN** 模型根据用户目标、上下文和可见合同判断最终结构应为 `routine` 或 `plan`
- **AND** 当前 run 只具备 `training` 动作事实
- **AND** 当前可见 tools 可继续查询缺失的 `warmup` / `stretch` 动作事实
- **THEN** Agent MUST 优先继续查询或选择缺失 section 的动作事实
- **AND** Agent MUST NOT 因当前只查到 `training` 动作就输出 `payload.kind = "exercise_selection"` 来替代 `routine` 或 `plan`
- **AND** Agent MUST NOT 把 `content` 中的自然语言处方或计划说明当作结构事实源

#### Scenario: plan 事实不足时不伪造结构
- **WHEN** 用户目标需要 `plan`
- **AND** 当前可见 tools 不可用、缺失 section 查询未命中、必要约束不足或动作事实无法支撑合法结构
- **THEN** Agent MUST 使用 `ask_user`、失败收口或不伪造结构事实的解释
- **AND** Agent MUST NOT 编造未获得的 `exerciseId`
- **AND** Agent MUST NOT 把 `groups.training` 中且 `allowedSections` 不包含 `warmup` / `stretch` 的动作写入 `warmup` 或 `stretch`
- **AND** Agent MUST NOT 输出不完整但伪装成功的 `plan`
