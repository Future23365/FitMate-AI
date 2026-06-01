## ADDED Requirements

### Requirement: Routine 和 Plan 草稿必须由 Agent 工具生成并校验

系统 SHALL 通过 Agent 工具生成 routine 或 plan 草稿，并在展示、保存或回复成功前执行统一校验和恢复流程。

#### Scenario: Agent 生成 routine 草稿
- **WHEN** Agent 决定生成或重新生成单次训练
- **THEN** Agent MUST 调用 `generateRoutineDraft` 或等价工具
- **AND** draft MUST 使用结构化 goal、sessionMinutes、equipment、experience、preferences、avoidances 和候选动作集合
- **AND** draft MUST 经过 `validateRoutineDraft` 通过后才能展示或保存

#### Scenario: Agent 生成 plan 草稿
- **WHEN** Agent 决定生成长期训练计划
- **THEN** Agent MUST 调用 `generatePlanDraft` 或等价工具
- **AND** draft MUST 使用结构化频率、周期、日程和候选动作集合
- **AND** draft MUST 经过 `validatePlanDraft` 通过后才能展示或保存

#### Scenario: 校验失败
- **WHEN** draft 未通过服务端校验
- **THEN** Agent MUST 消费结构化失败原因并选择修复、重新查询候选、澄清或失败恢复
- **AND** 系统 MUST NOT 展示未通过校验的训练卡片

