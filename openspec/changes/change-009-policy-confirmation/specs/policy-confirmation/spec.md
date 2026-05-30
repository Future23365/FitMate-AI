## ADDED Requirements

### Requirement: 写操作必须先经过 PolicyEngine
系统 SHALL 在修改 artifact、routine、schedule、用户记忆或训练计划前执行 Policy 检查。

#### Scenario: 修改当前未保存聊天草稿
- **WHEN** 用户要求替换当前 artifact 草稿中的单个动作
- **THEN** PolicyEngine MAY 返回 `allowed = true`
- **AND** `safeScope` SHOULD 为 `artifact_only` 或 `new_revision`
- **AND** 系统 MUST NOT 覆盖已保存 routine 或未来 schedule

#### Scenario: 修改已保存 routine
- **WHEN** 用户要求覆盖已保存 routine
- **THEN** PolicyEngine MUST 检查当前 userId 是否拥有该 routine
- **AND** PolicyEngine SHOULD 要求用户确认
- **AND** 系统 MAY 创建新 revision 而不是直接覆盖原 routine

### Requirement: 高影响操作必须经过 ConfirmationGate
系统 SHALL 对批量、持久化或高风险写操作要求用户确认。

#### Scenario: 批量修改未来 schedule
- **WHEN** Patch scope 指向多个 future schedules
- **THEN** ConfirmationGate MUST 要求用户确认影响范围
- **AND** 确认问题 MUST 展示目标日期范围、影响数量、操作摘要和关键 diff
- **AND** 用户确认前系统 MUST NOT 执行批量写入

#### Scenario: 改变周训练频率
- **WHEN** 用户要求将计划改为新的 weeklyFrequency
- **THEN** ConfirmationGate SHOULD 要求用户确认
- **AND** 系统 MUST 展示频率变化、恢复安排变化和受影响的计划范围

#### Scenario: 写入长期健康限制
- **WHEN** 系统准备将疼痛、伤病或高风险信号写入长期记忆
- **THEN** ConfirmationGate SHOULD 要求用户确认
- **AND** 用户可见文案 MUST 保持训练建议边界，不提供医疗诊断

### Requirement: 已完成训练历史默认不可修改
系统 SHALL 防止 AI 或 Patch 静默改写已完成 schedule 和训练结果。

#### Scenario: Patch 命中已完成 schedule
- **WHEN** Patch target 指向已完成 schedule 或 WorkoutSessionResult
- **THEN** PolicyEngine MUST 返回 blocked
- **AND** 系统 MUST 说明已完成历史不会被修改
- **AND** 系统 MAY 提供基于历史创建新计划或未来安排的选项

### Requirement: ConfirmationToken 必须绑定具体操作
系统 SHALL 确保用户确认的是具体目标、范围和 diff，而不是模糊授权。

#### Scenario: 用户确认高影响修改
- **WHEN** 用户确认某个需要确认的修改
- **THEN** 系统 MUST 校验 confirmation token 的 userId、目标 id、scope、操作类型、diff 摘要和有效期
- **AND** token 校验失败或过期时系统 MUST 拒绝写入并重新确认
- **AND** 写入前系统 MUST 重新执行 Policy 和 Validator
