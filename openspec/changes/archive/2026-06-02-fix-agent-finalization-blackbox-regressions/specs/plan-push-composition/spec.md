## MODIFIED Requirements

### Requirement: 长期计划推送必须服从 Agent 执行结果

系统 SHALL 让长期计划推送服从 Tool-first Agent 的结构化结果。长期计划生成请求 MUST 来自 Agent 已登记的 plan draft / edit plan / candidate set / validation / policy 输入，而不是旧 resolved intent。首次生成长期计划时，Agent MAY 使用本轮候选集合构造受控种子模板，无需强制引用已有 artifact。

#### Scenario: Agent 要求生成长期计划
- **WHEN** `AgentExecutionResult` 或 Agent tool result 表示本轮应生成长期计划
- **THEN** 长期计划生成流程 MUST 使用 Agent 提供的结构化计划输入、candidateSetId、用户约束、字段来源和 tool result ids
- **AND** 系统 MUST NOT 从旧 `workoutIntent`、`action.kind` 或回复正文重新判断是否生成 plan

#### Scenario: 首次生成长期计划
- **WHEN** Agent 调用 `generatePlanDraft` 或等价工具生成长期计划
- **AND** 当前会话没有可读取的 routine/plan source artifact
- **THEN** 工具 MUST 能从本轮候选集合生成受控 seed routine 或等价种子训练模板
- **AND** `DomainPlanEngine` MUST 使用该种子模板展开长期 plan
- **AND** 保存工具 MUST 创建新的 `ConversationArtifact(kind = "plan")`
- **AND** 系统 MUST NOT 因缺少 source artifact 阻断首次长期计划生成

#### Scenario: Agent 要求澄清或阻断
- **WHEN** Agent 返回 `needs_clarification`、`blocked` 或 `failed`
- **THEN** 系统 MUST NOT 调用长期计划生成流程
- **AND** 前端 MUST NOT 展示长期计划生成中的加载状态

#### Scenario: 计划草稿与 Agent 输入冲突
- **WHEN** 计划草稿的周期、周频、训练日数量、时长或器械条件与 Agent 结构化输入冲突
- **THEN** 系统 MUST 拒绝将该草稿作为成功计划返回
- **AND** 系统 MUST 进入 Agent failure handling、重新校验、重新生成或澄清路径

#### Scenario: 长期计划包含休息日
- **WHEN** Agent 生成的长期计划包含 `isRestDay = true` 的恢复日
- **THEN** Validator MUST NOT 将该恢复日按用户单次训练时长执行 `session_too_short` 或 `session_too_long` 硬校验
- **AND** Validator MUST 继续对非休息训练日执行用户明确时长约束
