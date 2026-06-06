## MODIFIED Requirements

### Requirement: visibleTrainingProposal 输出合同必须从 system prompt 解耦
系统 SHALL 通过 `outputContracts` 暴露 `visibleTrainingProposal` 的业务输出合同。默认 Agent system prompt SHALL 只要求模型遵守当前可见 `outputContracts[]`；`visibleTrainingProposal` 的 payload 业务结构、section coverage、处方、schedule、正文一致性和 examples MUST 由 `visibleTrainingProposal` output contract 承载。

#### Scenario: visibleTrainingProposal 合同可见
- **WHEN** production Planner 可输出训练推荐、训练编排或多天训练计划
- **THEN** `outputContracts` MUST 包含 `outputType = "visibleTrainingProposal"` 的合同
- **AND** 该合同 MUST 声明 `schemaVersion = "1"`
- **AND** 该合同 MUST 集中提供字段字典，解释 `visibleTrainingProposal`、`visible_training_proposal_fact`、`consumable resource`、`producedResources`、`resource summary`、`fulfillment.satisfied`、`missingSectionsForRoutineOrPlan`、`payload`、`exerciseItems` 和 `schedule.assignments`
- **AND** 该合同 MUST 说明 payload `kind` 只能是 `exercise_selection`、`routine` 或 `plan`
- **AND** 该合同 MUST 说明 `exerciseItems[*].exerciseId` 和 `exerciseItems[*].section` 必须由当前 run 可见动作事实或可消费训练事实支撑
- **AND** 该合同 MUST 说明 `content` 不能作为动作、处方、编排或计划事实源
- **AND** 该合同 MUST 说明 `final_answer.content` 中承诺的训练频次、周期、多天或一周安排必须由同一 `visibleOutputs[].payload` 的 `kind = "plan"` 和 `schedule.assignments` 表达
- **AND** 该合同 MUST 说明当 payload 为 `kind = "routine"` 时，`content` 只能描述单次训练编排，不能声称已生成多天、周期或每周计划

#### Scenario: routine 和 plan 的结构合同
- **WHEN** `visibleTrainingProposal` output contract 描述 `routine` 或 `plan`
- **THEN** 合同 MUST 说明 `routine` 和 `plan` 需要 `warmup`、`training`、`stretch` 三类 section 的当前 run 可消费动作事实
- **AND** 合同 MUST 说明 `routine` 和 `plan` 的每个动作项都必须绑定 `prescription`
- **AND** 合同 MUST 说明 `routine` 只表达一次可执行训练编排
- **AND** 合同 MUST 说明 `routine` 不得包含 `schedule`
- **AND** 合同 MUST 明确当前 `plan = one routine template + schedule`
- **AND** 合同 MUST 说明 `plan` 必须使用 `schedule.assignments` 表达周期内 `training` / `rest` 日
- **AND** 合同 MUST 说明 `schedule` 不得内嵌每天不同的完整动作编排
- **AND** 合同 MUST 说明当前 schema 不支持 `routines[]`、`schedule.assignments[].routineId` 或 A/B 多训练日模板
- **AND** 合同 MUST 说明缺少可消费 section 事实时不得伪造结构化输出

#### Scenario: output contract examples 覆盖关键边界
- **WHEN** `visibleTrainingProposal` output contract 暴露 examples
- **THEN** examples MUST 覆盖缺少训练约束时的 `ask_user`
- **AND** examples MUST 覆盖需要动作事实时的合法 `tool_call` 方向
- **AND** examples MUST 覆盖只有 `training` 事实但用户需要 `routine` 时不得降级为 `exercise_selection`
- **AND** examples MUST 覆盖已有三类 section 事实时输出 `routine`
- **AND** examples MUST 覆盖已有三类 section 事实且需要周期安排时输出单模板 `plan`
- **AND** 单模板 `plan` example MUST 使用 7 天周期和 3 个 `training` 日示范 `schedule.assignments`
- **AND** 单模板 `plan` example MUST 保持同一份 `exerciseItems` 作为可重复训练模板，不得示范每天不同完整动作编排
- **AND** examples MUST 覆盖基于已有对象 `derive`、`replace` 或 `modify` 的引用边界

## ADDED Requirements

### Requirement: visibleTrainingProposal 合同必须约束正文与 payload kind 一致
系统 SHALL 在模型可见 `visibleTrainingProposal` output contract 中表达用户可见正文与结构化 payload 的一致性。`final_answer.content` MAY 总结结构化输出，但 MUST NOT 承诺 `visibleOutputs[].payload` 未表达的训练频次、周期、多天安排、保存结果或执行结果。

#### Scenario: 周期承诺必须落到 plan payload
- **WHEN** Planner 输出 `final_answer.visibleOutputs[]` 中的 `visibleTrainingProposal`
- **AND** `final_answer.content` 表达训练频次、周期、多天或一周安排
- **THEN** 对应 payload MUST 使用 `kind = "plan"`
- **AND** 对应 payload MUST 包含 `schedule.assignments`
- **AND** `schedule.assignments` MUST 覆盖 `1..cycleLengthDays`
- **AND** `schedule.assignments[*].type` MUST 只使用 `training` 或 `rest`

#### Scenario: routine 正文不得伪装成周期计划
- **WHEN** Planner 输出 `visibleTrainingProposal.payload.kind = "routine"`
- **THEN** `final_answer.content` MUST 只描述一次可执行训练编排
- **AND** `final_answer.content` MUST NOT 声称已生成多天训练计划、周期计划、每周训练安排或训练日 / 休息日安排
- **AND** 如用户目标需要周期安排但当前事实不足以生成 `plan`，Planner MUST 继续合法 `tool_call`、返回 `ask_user` 或失败收口，而不是用 `routine` 伪装完成

#### Scenario: 合同不引入关键词路由
- **WHEN** output contract 表达 `routine` 与 `plan` 的一致性边界
- **THEN** 合同 MUST 使用结构语义描述“训练频次、周期、多天或一周安排”
- **AND** 合同 MUST NOT 写成“用户说某个固定短语时必须输出某个 kind”
- **AND** `/api/chat`、Agent runtime、validator、tool handler 和 renderer MUST NOT 根据用户原文关键词、正则、同义词表或短句模板改写 `payload.kind`
