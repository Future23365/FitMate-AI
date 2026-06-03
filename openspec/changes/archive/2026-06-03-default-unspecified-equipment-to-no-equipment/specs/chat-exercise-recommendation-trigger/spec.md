## ADDED Requirements

### Requirement: 未指定器械的动作推荐必须默认无器械

当用户请求某个训练目标、身体部位或动作类别的纯动作推荐，且没有明确提供可用器械时，系统 SHALL 默认推荐无器械或自重动作。用户明确提供可用器械时，动作推荐 SHALL 使用该器械边界。

#### Scenario: 用户只说明训练部位
- **WHEN** 用户输入“今天我想练胸”或等价纯动作推荐请求
- **AND** Agent 没有读取到当前消息、已确认上下文或用户记忆中的正向可用器械事实
- **THEN** Agent MUST 使用无器械或自重候选生成 `exercise_recommendation`
- **AND** 系统 MUST NOT 因缺少器械条件追问用户

#### Scenario: 用户明确提供可用器械
- **WHEN** 用户输入“我有哑铃，推荐几个练胸动作”或等价请求
- **THEN** Agent MUST 使用哑铃或动作库真实等价器械 facet 检索推荐候选
- **AND** 系统 MUST NOT 用默认无器械覆盖该器械条件

#### Scenario: 用户明确要求不用器械
- **WHEN** 用户输入“推荐几个不用器械的练腿动作”或等价请求
- **THEN** Agent MUST 使用无器械或自重候选生成 `exercise_recommendation`
- **AND** 推荐卡中的动作 MUST 能通过候选 evidence 证明满足无器械边界
