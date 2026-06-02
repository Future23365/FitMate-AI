## ADDED Requirements

### Requirement: 长期计划补齐必须识别每周 N 练

系统 SHALL 将用户在长期计划补齐流程中表达的 `每周N练` 或 `一周N练` 识别为周频事实，并用于后续 plan completion 门控。

#### Scenario: 每周 N 练进入结构化上下文

- **GIVEN** 用户已经提出长期训练计划请求
- **WHEN** 用户补充 `每周4练，每次45分钟`
- **THEN** 系统 MUST 在会话结构化上下文中记录 `weeklyFrequency=4`
- **AND** 系统 MUST 在会话结构化上下文中记录 `sessionMinutes=45`

#### Scenario: 目标和器械补齐后触发长期计划

- **GIVEN** 会话结构化上下文已经包含长期计划的 `weeklyFrequency=4` 和 `sessionMinutes=45`
- **WHEN** 用户继续输入 `增肌，有健身房器械`
- **THEN** 系统 MUST 将本轮归一化为 `workout_plan`
- **AND** 系统 MUST 触发 `workout_plan`
- **AND** 系统 MUST NOT 降级为 `exercise_recommendation`
