## ADDED Requirements

### Requirement: Tool-first Agent 必须将每周训练安排路由到 plan 工具链

当用户明确请求一周、多周、周期性、长期或每周训练安排时，系统 SHALL 让 Tool-first Agent 使用 plan scope 的候选、草稿、校验、Policy 和保存工具链生成长期计划。单次时长 SHALL 作为计划中训练日的 `sessionMinutes`，不得让它覆盖每周频率并把请求降级为 routine。

#### Scenario: 每周频率和单次时长同时出现

- **WHEN** 用户请求“每周 4 练，每次 45 分钟”或等价的每周训练安排
- **AND** 目标、频率、单次时长和必要训练条件已经足够生成计划
- **THEN** Agent MUST 调用 `searchExercises` 时使用 `candidateUse = "plan"`
- **AND** Agent MUST 继续调用 `generatePlanDraft`
- **AND** 最终生成结果 MUST 是 `kind = "plan"` 的长期计划 artifact
- **AND** 系统 MUST NOT 保存或展示 `kind = "routine"` 的单次编排来代表该每周训练安排

#### Scenario: 每周频率决定 plan scope

- **WHEN** 用户请求同时包含每周频率和单次训练时长
- **THEN** 系统 MUST 将每周频率作为 plan scope 的结构化边界
- **AND** 系统 MUST 将单次训练时长作为计划训练日的时长约束
- **AND** 系统 MUST NOT 因存在单次训练时长而优先进入 routine 工具链

#### Scenario: 计划条件不足

- **WHEN** 用户提出每周、多天或周期性训练安排
- **AND** 目标、频率、时长、器械或场地等核心条件仍不足以生成计划
- **THEN** Agent MUST 返回 `needs_clarification`
- **AND** 系统 MUST NOT 退回生成单次 routine 作为替代结果
