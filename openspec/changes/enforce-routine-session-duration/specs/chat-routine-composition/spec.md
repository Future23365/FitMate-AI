## ADDED Requirements

### Requirement: 明确时长的 routine 必须接近目标可执行时长

聊天推送单次 routine 时，如果用户明确提供单次训练时长，系统 SHALL 使用服务端确定性估算结果校验草稿是否接近该目标时长，并以该估算作为卡片预估时长来源。

#### Scenario: Routine 声明时长不能覆盖实际估算

- **WHEN** AI routine 草稿声明 `estimatedSessionMinutes = 40`
- **AND** 服务端按动作参数、休息和主训练循环估算实际时长为 25 分钟
- **THEN** 系统 MUST 以服务端估算结果判断该草稿是否满足目标时长
- **AND** 系统 MUST NOT 因为声明字段为 40 分钟就判定该草稿满足用户目标

#### Scenario: 时长不足时补足训练容量

- **WHEN** 用户要求 40 分钟本次训练
- **AND** routine 草稿实际估算明显低于 40 分钟
- **THEN** 自动修复 MUST 优先通过增加主训练循环轮数、主训练动作组数、合理次数、合适训练动作或合理休息来补足时长
- **AND** 自动修复 MUST 保持热身、主训练、拉伸三段式结构
- **AND** 自动修复后的草稿 MUST 重新通过服务端校验后才能展示
