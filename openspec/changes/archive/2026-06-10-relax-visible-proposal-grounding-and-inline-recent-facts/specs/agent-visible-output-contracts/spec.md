## MODIFIED Requirements

### Requirement: visibleTrainingProposal 输出合同必须从 system prompt 解耦
系统 SHALL 通过 `outputContracts` 暴露 `visibleTrainingProposal` 的业务输出合同。默认 Agent system prompt SHALL 只要求模型遵守当前可见 `outputContracts[]`；`visibleTrainingProposal` 的 payload 业务结构、section coverage、处方、schedule、正文一致性、数据库事实校验和 examples MUST 由 `visibleTrainingProposal` output contract 承载。

#### Scenario: visibleTrainingProposal 合同可见
- **WHEN** production Planner 可输出训练推荐、训练编排或多天训练计划
- **THEN** `outputContracts` MUST 包含 `outputType = "visibleTrainingProposal"` 的合同
- **AND** 该合同 MUST 声明 `schemaVersion = "1"`
- **AND** 该合同 MUST 集中提供字段字典，解释 `visibleTrainingProposal`、历史可见训练方案事实、`payload`、`exerciseItems`、`prescription`、`schedule.assignments` 和 `missingSectionsForRoutineOrPlan`
- **AND** 该合同 MUST 说明 payload `kind` 只能是 `exercise_selection`、`routine` 或 `plan`
- **AND** 该合同 MUST 说明 `exerciseItems[*].exerciseId` 必须引用服务端数据库中存在、发布态可展示且当前用户可访问的动作
- **AND** 该合同 MUST 说明 `exerciseItems[*].section` 必须被对应数据库动作事实的 `allowedSections` 覆盖
- **AND** 该合同 MUST 说明当前 run tool result 或服务端内部可消费事实可以作为 trace / provenance 来源，但不是新生成训练卡片通过 validator 的唯一准入条件
- **AND** 该合同 MUST NOT 要求模型在 `visibleTrainingProposal`、`final_answer` 或 `ask_user` 中输出 `usedRefs`、`resourceId`、`toolResultId`、`factRef` 或 `messageId`
- **AND** 该合同 MUST 说明 `content` 不能作为动作、处方、编排或计划事实源
- **AND** 该合同 MUST 说明 `final_answer.content` 中承诺的训练频次、周期、多天或一周安排必须由同一 `visibleOutputs[].payload` 的 `kind = "plan"` 和 `schedule.assignments` 表达
- **AND** 该合同 MUST 说明当 payload 为 `kind = "routine"` 时，`content` 只能描述单次训练编排，不能声称已生成多天、周期或每周计划

#### Scenario: routine 和 plan 的结构合同
- **WHEN** `visibleTrainingProposal` output contract 描述 `routine` 或 `plan`
- **THEN** 合同 MUST 说明 `routine` 和 `plan` 需要 `warmup`、`training`、`stretch` 三类 section 的结构化动作项
- **AND** 合同 MUST 说明每个动作项都必须通过数据库事实、发布态、可访问性和 `allowedSections` 校验
- **AND** 合同 MUST 说明服务端已读取并投影给模型的历史训练方案业务事实可以作为复用、派生或调整依据
- **AND** 合同 MUST 说明历史事实的内部来源、resource 和 trace 引用由服务端维护，模型不得复制或输出内部 ID
- **AND** 合同 MUST 说明 `routine` 和 `plan` 的每个动作项都必须绑定 `prescription`
- **AND** 合同 MUST 说明 `routine` 只表达一次可执行训练编排
- **AND** 合同 MUST 说明 `routine` 不得包含 `schedule`
- **AND** 合同 MUST 明确当前 `plan = one routine template + schedule`
- **AND** 合同 MUST 说明 `plan` 必须使用 `schedule.assignments` 表达周期内 `training` / `rest` 日
- **AND** 合同 MUST 说明 `schedule` 不得内嵌每天不同的完整动作编排
- **AND** 合同 MUST 说明当前 schema 不支持 `routines[]`、`schedule.assignments[].routineId` 或 A/B 多训练日模板
- **AND** 合同 MUST 说明事实不足时不得伪造结构化输出；如果缺少训练目标、关键限制、处方或 schedule 必要信息，Planner 应继续合法 `tool_call`、返回 `ask_user` 或失败收口

#### Scenario: output contract examples 覆盖关键边界
- **WHEN** `visibleTrainingProposal` output contract 暴露 examples
- **THEN** examples MUST 覆盖缺少训练约束时的 `ask_user`
- **AND** examples MUST 覆盖需要动作事实时的合法 `tool_call` 方向
- **AND** examples MUST 覆盖数据库合法动作可以通过 `visibleTrainingProposal` validator，即使该动作没有当前 run section-scoped provenance
- **AND** examples MUST 覆盖只有 `training` 事实但用户需要 `routine` 时不得降级为 `exercise_selection`
- **AND** examples MUST 覆盖已有三类 section 结构时输出 `routine`
- **AND** examples MUST 覆盖已有三类 section 结构且需要周期安排时输出单模板 `plan`
- **AND** 单模板 `plan` example MUST 使用 7 天周期和 3 个 `training` 日示范 `schedule.assignments`
- **AND** 单模板 `plan` example MUST 保持同一份 `exerciseItems` 作为可重复训练模板，不得示范每天不同完整动作编排
- **AND** examples MUST 覆盖基于已有对象 `derive`、`replace` 或 `modify` 的历史事实边界
