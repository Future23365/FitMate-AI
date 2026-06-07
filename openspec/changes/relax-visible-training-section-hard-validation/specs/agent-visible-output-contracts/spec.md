## MODIFIED Requirements

### Requirement: visibleTrainingProposal 输出合同必须从 system prompt 解耦
系统 SHALL 通过 `outputContracts` 暴露 `visibleTrainingProposal` 的业务输出合同。默认 Agent system prompt SHALL 只要求模型遵守当前可见 `outputContracts[]`；`visibleTrainingProposal` 的 payload 业务结构、section 完整度偏好、处方、schedule、正文一致性和 examples MUST 由 `visibleTrainingProposal` output contract 承载。

#### Scenario: visibleTrainingProposal 合同可见
- **WHEN** production Planner 可输出训练推荐、训练编排或多天训练计划
- **THEN** `outputContracts` MUST 包含 `outputType = "visibleTrainingProposal"` 的合同
- **AND** 该合同 MUST 声明 `schemaVersion = "1"`
- **AND** 该合同 MUST 集中提供字段字典，解释 `visibleTrainingProposal`、`visible_training_proposal_fact`、`consumable resource`、`producedResources`、`resource summary`、`fulfillment.satisfied`、`payload`、`exerciseItems` 和 `schedule.assignments`
- **AND** 该合同 MUST 说明 payload `kind` 只能是 `exercise_selection`、`routine` 或 `plan`
- **AND** 该合同 MUST 说明 `exerciseItems[*].exerciseId` 和 `exerciseItems[*].section` 必须由当前 run 可见动作事实或可消费训练事实支撑
- **AND** 该合同 MUST 说明 `content` 不能作为动作、处方、编排或计划事实源
- **AND** 该合同 MUST 说明 `final_answer.content` 中承诺的训练频次、周期、多天或一周安排必须由同一 `visibleOutputs[].payload` 的 `kind = "plan"` 和 `schedule.assignments` 表达
- **AND** 该合同 MUST 说明当 payload 为 `kind = "routine"` 时，`content` 只能描述单次训练编排，不能声称已生成多天、周期或每周计划

#### Scenario: routine 和 plan 的结构合同
- **WHEN** `visibleTrainingProposal` output contract 描述 `routine` 或 `plan`
- **THEN** 合同 MUST 正向引导 `routine` 和 `plan` 优先组织为 `warmup`、`training`、`stretch` 三类 section
- **AND** 合同 MUST 说明 `training` 是 `routine` 和 `plan` 的必要主训练动作事实
- **AND** 合同 MUST 说明已有可用 `warmup` 或 `stretch` 动作事实时，不应只输出主训练
- **AND** 合同 MUST NOT 告诉模型 `warmup` 或 `stretch` 可以省略、可选或不需要生成
- **AND** 合同 MUST 说明 `routine` 和 `plan` 的每个动作项都必须绑定 `prescription`
- **AND** 合同 MUST 说明 `routine` 只表达一次可执行训练编排
- **AND** 合同 MUST 说明 `routine` 不得包含 `schedule`
- **AND** 合同 MUST 明确当前 `plan = one routine template + schedule`
- **AND** 合同 MUST 说明 `plan` 必须使用 `schedule.assignments` 表达周期内 `training` / `rest` 日
- **AND** 合同 MUST 说明 `schedule` 不得内嵌每天不同的完整动作编排
- **AND** 合同 MUST 说明当前 schema 不支持 `routines[]`、`schedule.assignments[].routineId` 或 A/B 多训练日模板
- **AND** 合同 MUST 说明缺少动作事实时不得伪造结构化输出

#### Scenario: output contract examples 覆盖关键边界
- **WHEN** `visibleTrainingProposal` output contract 暴露 examples
- **THEN** examples MUST 覆盖缺少训练约束时的 `ask_user`
- **AND** examples MUST 覆盖需要动作事实时的合法 `tool_call` 方向
- **AND** examples MUST 覆盖只有 `training` 事实但用户需要 `routine` 时应优先继续补齐 support section，而不是降级为 `exercise_selection`
- **AND** examples MUST 覆盖已有三类 section 事实时输出 `routine`
- **AND** examples MUST 覆盖已有三类 section 事实且需要周期安排时输出单模板 `plan`
- **AND** 单模板 `plan` example MUST 使用 7 天周期和 3 个 `training` 日示范 `schedule.assignments`
- **AND** 单模板 `plan` example MUST 保持同一份 `exerciseItems` 作为可重复训练模板，不得示范每天不同完整动作编排
- **AND** examples MUST 覆盖基于已有对象 `derive`、`replace` 或 `modify` 的引用边界
