## MODIFIED Requirements

### Requirement: 高影响操作必须经过 ConfirmationGate
系统 SHALL 对批量、持久化或高影响写操作要求用户确认，但健康、疼痛、伤病、不适或医疗健康信号本身 SHALL NOT 作为需要确认的写操作原因。

#### Scenario: 批量修改未来 schedule
- **WHEN** Patch scope 指向多个 future schedules
- **THEN** ConfirmationGate MUST 要求用户确认影响范围
- **AND** 确认问题 MUST 展示目标日期范围、影响数量、操作摘要和关键 diff
- **AND** 用户确认前系统 MUST NOT 执行批量写入

#### Scenario: 改变周训练频率
- **WHEN** 用户要求将计划改为新的 weeklyFrequency
- **THEN** ConfirmationGate SHOULD 要求用户确认
- **AND** 系统 MUST 展示频率变化、恢复安排变化和受影响的计划范围

#### Scenario: 用户表达健康或不适信号
- **WHEN** 用户消息包含疼痛、伤病、高风险症状、不适或医疗健康信号
- **THEN** ConfirmationGate MUST NOT 因该信号要求用户确认长期健康限制
- **AND** 系统 MUST NOT 将该信号作为训练生成决策边界写入待确认操作
