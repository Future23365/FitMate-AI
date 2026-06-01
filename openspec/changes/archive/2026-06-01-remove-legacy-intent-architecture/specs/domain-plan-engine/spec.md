## ADDED Requirements

### Requirement: PlanStrategy 必须从 Agent 结构化输入派生
系统 SHALL 从 Agent 已登记的结构化计划输入、`WorkoutEditPlan`、tool results、candidateSetId、字段来源和用户约束派生 `PlanStrategy`，而不是从旧 resolved intent 派生。

#### Scenario: Agent 请求生成长期计划
- **WHEN** Agent 通过工具请求生成长期计划草稿
- **THEN** `DomainPlanEngine` MUST 接收 Agent 提供的结构化计划输入和字段来源
- **AND** `PlanStrategy` MUST 记录这些字段来源
- **AND** `DomainPlanEngine` MUST NOT 读取旧 `ResolvedChatIntent`、`workoutIntent` 或 `referenceResolution`

#### Scenario: Agent 请求基于历史 artifact 生成计划
- **WHEN** Agent 的计划输入引用历史 routine 或 plan artifact
- **THEN** `DomainPlanEngine` MUST 使用 Agent tool result 中已读取并校验的 active artifact payload
- **AND** `DomainPlanEngine` MUST NOT 从 `conversationSummary` 或旧 referenceResolution 重建完整训练内容

## REMOVED Requirements

### Requirement: PlanStrategy 必须从 resolved intent 派生

**Reason**: `resolved intent` 不再是聊天生产执行合同。

**Migration**: `PlanStrategy` 从 Agent 结构化输入、tool results、candidate set、artifact payload 和字段来源派生。
