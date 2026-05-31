## MODIFIED Requirements

### Requirement: 长期计划保存前必须经过 Validator

系统 SHALL 在长期计划返回给用户或进入保存流程前执行服务端契约校验。Validator SHALL 校验训练日数量、动作来源、结构、字段来源、引用 artifact、权限和用户明确约束；连续负荷、训练日重复、section 语义、训练量高低和恢复安排合理性 SHALL 作为 warning 或 LLM 语义判断，不得单独阻止计划展示。

#### Scenario: 生成 schedule preview

- **WHEN** DomainPlanEngine 输出 schedule preview
- **THEN** Validator MUST 校验训练日数量是否满足用户明确周期和频率约束
- **AND** Validator MUST 校验动作来自本轮候选集合或受控 artifact payload
- **AND** Validator MUST 校验 payload 结构和引用来源与 PlanStrategy 一致
- **AND** Validator MUST NOT 仅因连续负荷、训练日重复、动作 section 或训练量合理性 warning 阻止计划展示

#### Scenario: 用户明确要求重复当前 routine

- **WHEN** 用户要求连续多天或多个训练日重复当前 routine
- **AND** PlanStrategy 使用 `repeat_previous_routine`、`repeat_same_routine_with_progression` 或等价重复策略
- **THEN** Validator MUST 接受重复训练日作为符合用户意图的计划结构
- **AND** Validator MUST NOT 返回 `day_similarity_high` 或 `consecutive_load_high` 作为 hard fail
- **AND** 系统 MAY 在 trace 或草稿提示中记录连续训练 warning

#### Scenario: 引用 artifact 不可用

- **WHEN** PlanStrategy 引用的 sourceArtifactId 不存在、不可访问或 payload 无法校验
- **THEN** 系统 MUST 返回可恢复的继续对话引导
- **AND** 系统 MUST NOT 从 conversationSummary 重建完整训练计划

#### Scenario: 字段来源控制频率和时长契约

- **WHEN** DomainPlanEngine 输出的训练日数量或单次时长与 PlanStrategy 不一致
- **AND** 对应 PlanStrategy 字段来源是 `current_user_message`、`history` 或 `artifact`
- **THEN** Validator MAY 将该不一致判定为契约失败
- **AND** 系统 MUST 进入修复或恢复流程

#### Scenario: 默认字段不阻止计划展示

- **WHEN** DomainPlanEngine 输出的训练日数量或单次时长与 PlanStrategy 不一致
- **AND** 对应 PlanStrategy 字段来源是 `default` 或 `llm_inferred`
- **THEN** Validator MUST NOT 将该不一致作为 hard fail
- **AND** 系统 MAY 记录 warning 并允许计划展示
