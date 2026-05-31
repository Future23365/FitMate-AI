## ADDED Requirements

### Requirement: PlanStrategy 必须从 resolved intent 派生
系统 SHALL 由最终 resolved intent 派生 `PlanStrategy`，并保留关键字段来源，避免 DomainPlanEngine 自行重解释用户请求。

#### Scenario: resolved intent 包含计划约束
- **WHEN** resolved intent 要求生成 `workout_plan`
- **THEN** `PlanStrategy` MUST 从 resolved intent 的 `workoutIntent`、referenceResolution 和字段来源派生
- **AND** `PlanStrategy` MUST 表达 `horizonDays`、`weeklyFrequency`、`sessionMinutes`、`strategy`、`sourceArtifactId` 和关键字段来源
- **AND** DomainPlanEngine MUST NOT 从自然语言回复正文重新推断这些关键字段

#### Scenario: PlanStrategy 接收字段来源
- **WHEN** `PlanStrategy` 由 resolved intent 派生
- **THEN** `PlanStrategy` MUST 保留周期、周频率、单次时长和引用来源的字段来源
- **AND** 后续输出校验和用户回复 MUST 能区分用户明确约束、历史上下文、artifact 来源、LLM 推断和系统默认值

#### Scenario: resolved intent 引用历史 routine
- **WHEN** resolved intent 的长期计划请求基于历史 routine artifact
- **AND** ReferenceResolver 已解析到可访问 artifact
- **THEN** `PlanStrategy.sourceArtifactId` MUST 使用该 artifact
- **AND** DomainPlanEngine MUST 通过受控 artifact payload 展开计划
- **AND** DomainPlanEngine MUST NOT 从 conversationSummary 重建完整 routine

### Requirement: DomainPlanEngine 默认值必须受字段来源约束
系统 SHALL 控制 DomainPlanEngine 对周期、频率和时长默认值的使用，避免默认值静默覆盖 resolved intent。

#### Scenario: resolved intent 未提供周期且允许默认
- **WHEN** resolved intent 没有明确计划周期或日历范围
- **AND** 字段来源允许使用默认计划周期
- **THEN** DomainPlanEngine MAY 使用默认 `horizonDays`
- **AND** `PlanStrategy` MUST 标记该周期来源为 `default`
- **AND** 调用方 MUST 在用户回复或可见建议中说明该默认周期假设

#### Scenario: resolved intent 提供明确周期
- **WHEN** resolved intent 或其字段来源表明用户已提供明确计划周期或日历范围
- **THEN** DomainPlanEngine MUST 使用该周期或日历范围
- **AND** DomainPlanEngine MUST NOT 回退到默认 `horizonDays`

#### Scenario: 默认值会改变用户结果
- **WHEN** DomainPlanEngine 需要使用默认周期、频率或时长生成结果
- **AND** 该默认值会改变用户可见的计划长度、训练日数量或训练节奏
- **THEN** 系统 MUST 在回复或可见建议中表达默认假设
- **AND** 系统 MUST 提供用户可继续调整该默认值的路径

### Requirement: DomainPlanEngine 输出必须与 PlanStrategy 一致
系统 SHALL 在返回长期计划草稿前校验 DomainPlanEngine 输出与 `PlanStrategy` 一致。

#### Scenario: 输出周期与 strategy 冲突
- **WHEN** DomainPlanEngine 生成的 draft 包含 `cycleLengthDays` 或 `calendarHorizonDays`
- **AND** 这些字段与 `PlanStrategy.horizonDays` 冲突
- **THEN** 系统 MUST 拒绝该 draft 作为成功计划返回
- **AND** 系统 MUST 进入自动修复或可继续对话恢复流程

#### Scenario: 输出周频率与 strategy 冲突
- **WHEN** DomainPlanEngine 生成的 draft 包含 `weeklyFrequency`
- **AND** 该字段与 `PlanStrategy.weeklyFrequency` 冲突
- **THEN** 系统 MUST 拒绝该 draft 作为成功计划返回
- **AND** 系统 MUST 记录可用于 AI Trace 排查的冲突信息

#### Scenario: 输出引用来源与 strategy 冲突
- **WHEN** `PlanStrategy.sourceArtifactId` 存在
- **AND** DomainPlanEngine 输出的 schedule preview 或 draft 元数据引用了不同 artifact
- **THEN** 系统 MUST 拒绝该 draft 作为成功计划返回
- **AND** 系统 MUST NOT 展示基于错误 artifact 的计划卡片
