## ADDED Requirements

### Requirement: Routine 和 Plan 草稿必须由 Agent 工具生成并校验

系统 SHALL 通过 Agent 工具生成 routine 或 plan 草稿，并在展示、保存或回复成功前执行统一校验和恢复流程。

#### Scenario: Agent 生成 routine 草稿
- **WHEN** Agent 决定生成或重新生成单次训练
- **THEN** Agent MUST 调用 `generateRoutineDraft` 或等价工具
- **AND** draft MUST 使用结构化 goal、sessionMinutes、equipment、experience、preferences、avoidances、ContextPackage 摘要和 candidateSetId
- **AND** draft MUST 经过 `validateRoutineDraft` 通过后才能展示或保存

#### Scenario: Agent 生成 plan 草稿
- **WHEN** Agent 决定生成长期训练计划
- **THEN** Agent MUST 调用 `generatePlanDraft` 或等价工具
- **AND** draft MUST 使用结构化频率、周期、日程、ContextPackage 摘要和 candidateSetId
- **AND** draft MUST 经过 `validatePlanDraft` 通过后才能展示或保存

#### Scenario: 生成工具复用领域服务
- **WHEN** routine 或 plan 生成工具执行
- **THEN** 工具 MUST 复用 DomainPlanEngine、候选集合、时长估算、Validator、validation recovery 和 Policy 边界
- **AND** LLM MAY 参与非确定性排序、说明、草稿提案或修复建议
- **AND** 系统 MUST NOT 将完整训练结构生成完全外包给没有候选集合和领域校验依赖的单次 LLM 调用

#### Scenario: 校验失败
- **WHEN** draft 未通过服务端校验
- **THEN** Agent MUST 消费结构化失败原因并选择修复、重新查询候选、澄清或失败恢复
- **AND** 系统 MUST NOT 展示未通过校验的训练卡片

#### Scenario: 保存生成结果
- **WHEN** draft 通过 Validator 和 Policy 后需要展示或保存
- **THEN** 保存工具 MUST 引用 draftId、validationId、policyDecisionId 和候选集合来源
- **AND** 保存结果 MUST 返回 revisionId 或明确失败
- **AND** 最终回复和 artifact 事件 MUST 使用保存结果，而不是生成工具的自然语言承诺
