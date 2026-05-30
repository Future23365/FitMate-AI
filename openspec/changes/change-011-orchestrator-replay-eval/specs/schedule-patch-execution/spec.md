## ADDED Requirements

### Requirement: future_schedules Patch 必须在确认后真实写入未来安排
系统 SHALL 支持将通过 Policy、Confirmation 和 Validator 的 `future_schedules` Patch 写入未来训练安排。

#### Scenario: 批量替换未来动作
- **WHEN** 用户确认“后面都别安排俯卧撑”
- **AND** Patch target 只命中未来 schedule
- **THEN** 系统 MUST 替换未来 schedule 中匹配的动作
- **AND** 系统 MUST 保持已完成 schedule 和 WorkoutSessionResult 不变
- **AND** 写入结果 MUST 包含受影响 schedule、动作 diff 和新版本摘要

### Requirement: 日历级 Patch 操作必须有明确冲突策略
系统 SHALL 为移动训练日、标记休息日和改变周频率提供显式冲突策略，不得静默覆盖已有安排。

#### Scenario: 移动训练日到已有安排日期
- **WHEN** Patch operation 为 `move_training_day`
- **AND** `toDate` 已存在训练安排
- **THEN** 系统 MUST 按 `conflictPolicy` 执行 ask、shift 或 overwrite_empty_only
- **AND** 未指定冲突策略时系统 MUST 要求用户确认

#### Scenario: 明天改为休息日
- **WHEN** 用户说“明天休息”
- **THEN** 系统 MUST 定位明天的 future schedule
- **AND** 系统 MUST 根据 `rescheduleOriginal` 决定移动原训练或取消安排
- **AND** 该操作 MUST 经过 Policy 和 Validator

### Requirement: 周频率调整必须重排未来训练日并保留可解释 diff
系统 SHALL 在改变 weeklyFrequency 时重算未来训练日、恢复间隔和训练容量，并输出可解释 diff。

#### Scenario: 改成一周四练但别太累
- **WHEN** 用户确认将计划改成一周四练且强度保守
- **THEN** DomainPlanEngine MUST 重新生成未来 schedule preview
- **AND** Schedule Service MUST 只写入用户确认范围内的未来安排
- **AND** 写入结果 MUST 展示频率变化、休息日变化和受影响日期数量

### Requirement: schedule 写入必须版本化并保留审计信息
系统 SHALL 为 AI 修改未来 schedule 的写入记录来源、原因、trace runId 和前后差异。

#### Scenario: 成功写入未来安排
- **WHEN** Schedule Service 执行 AI Patch 写入
- **THEN** 系统 MUST 记录来源 artifact、Patch operation、confirmation checkpoint、trace runId 和 diff 摘要
- **AND** 后续引用解析 MUST 能读取修改后的 active schedule 状态
