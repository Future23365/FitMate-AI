## ADDED Requirements

### Requirement: Agent routine 检索必须表达分段器械边界

Agent 调用 `searchExercises(candidateUse = "routine")` 时，系统 SHALL 区分全局 hard filter、主训练器械边界和 warmup / stretch 补充边界。普通器械表达不得被默认解释为所有 section 都必须使用该器械。

#### Scenario: 普通器械表达
- **WHEN** 用户在 routine 请求中表达“有哑铃”“可以用哑铃”或等价可用器械
- **THEN** Agent MUST 将该器械视为 `training` 主训练候选约束或偏好
- **AND** `searchExercises` 的模型可见合同 MUST 提醒 Agent 不要默认把该器械作为 `warmup` / `stretch` 的全局 hard filter
- **AND** `searchExercises` 或后续 routine draft 工具 MUST 能用无器械受控补充候选满足 `warmup` / `stretch` 覆盖

#### Scenario: 全局 equipment 导致 section 覆盖风险
- **WHEN** Agent 传入全局 `filters.equipment.in` 且 `allowedSections` 同时包含 `warmup`、`training`、`stretch`
- **AND** `resultRequirements.sectionCoverage` 要求三段式覆盖
- **THEN** 系统 MUST 保留可诊断的 `appliedFilters`、`resultRequirementProof` 和 `controlledSupplementalCandidates`
- **AND** 后续 `generateRoutineDraft` MUST 使用这些结构化证据恢复分段，而不是要求用户补充已确认的无器械热身或拉伸信息

#### Scenario: 明确全程器械表达
- **WHEN** 结构化输入明确表示所有 section 都必须使用同一器械
- **THEN** 系统 MUST 保留该 hard constraint
- **AND** 如果无法满足 `sectionCoverage`，工具结果 MUST 提供稳定的结构化诊断或阻断原因
- **AND** 系统 MUST NOT 因默认无器械补充规则覆盖用户明确 hard constraint
