## ADDED Requirements

### Requirement: Plan draft 必须由 LLM 输出完整计划结构

聊天长期计划生成 SHALL 要求 LLM 输出完整 `WorkoutPlanDraft` 或等价 structured plan。`generatePlanDraft` MUST 接收并登记该 structured draft，而不得由服务端根据 `PlanStrategy`、source routine 或候选动作自动生成完整计划语义。

#### Scenario: LLM 提交完整 plan draft
- **WHEN** Agent 调用 `generatePlanDraft`
- **THEN** 输入 MUST 包含 LLM-authored `WorkoutPlanDraft` 或等价 structured plan
- **AND** draft MUST 包含训练日、休息日、schedule pattern、训练日 sections 和动作执行参数
- **AND** draft 中每个训练动作 MUST 可追溯到本轮候选集合或合法 source artifact

#### Scenario: 服务端校验 plan draft
- **WHEN** `generatePlanDraft` 收到 LLM-authored plan draft
- **THEN** 服务端 MUST 校验 draft schema
- **AND** 服务端 MUST 校验候选动作边界
- **AND** 服务端 MUST 校验 plan metadata 与 structured strategy 的确定性一致性
- **AND** 服务端 MUST NOT 重写训练日内容、动作分布、递进语义或恢复策略

#### Scenario: 缺少完整 plan draft
- **WHEN** Agent 调用 `generatePlanDraft` 但没有提交 LLM-authored plan draft
- **THEN** Tool MUST 返回结构化失败
- **AND** 系统 MUST NOT 用 source routine 或候选动作自动展开 plan

### Requirement: Plan 首次生成不得依赖服务端 seed routine 编排

当用户首次请求生成长期计划且没有 source artifact 时，LLM SHALL 直接基于候选动作输出完整 plan draft。服务端 MUST NOT 先构造 seed routine 再展开长期计划。

#### Scenario: 无 source artifact 的 plan
- **WHEN** 用户请求从零生成长期 plan
- **AND** Agent 已通过 `searchExercises(candidateUse="plan")` 获取候选集合
- **THEN** LLM MUST 基于候选集合输出完整 plan draft
- **AND** `generatePlanDraft` MUST 只登记和校验该 draft
- **AND** 服务端 MUST NOT 调用 routine 自动编排 helper 生成 seed routine
