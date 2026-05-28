## MODIFIED Requirements

### Requirement: 默认估算时长需要在可见回复中提示

当系统为明确动作列表的单次训练使用默认或估算时长时，聊天可见回复 SHALL 根据服务端上下文自然说明时长来源：如果 `serverWorkoutIntent.sessionMinutes` 已明确，回复 SHALL 按该时长描述本次训练；如果服务端上下文没有明确 `sessionMinutes`，回复 SHALL 用宽泛语言说明会先按估算时长整理，并提示用户可以继续补充时长调整。

#### Scenario: 使用默认估算时长生成单次训练

- **WHEN** 用户提供明确动作列表并要求生成单次训练，但服务端上下文没有明确 `sessionMinutes`
- **THEN** 助手可见回复 MUST 提示当前会先按估算时长整理
- **THEN** 助手可见回复 MUST 提示用户可以补充具体时长用于调整
- **THEN** 助手可见回复 MUST NOT 使用固定模板句
- **THEN** 助手可见回复 MUST NOT 直接列出训练动作清单

#### Scenario: 服务端上下文已有训练时长

- **WHEN** `serverWorkoutIntent.sessionMinutes` 已明确，例如用户输入“练腿，20分钟，没有器械”
- **THEN** 助手可见回复 MUST 按该时长描述本次训练
- **THEN** 助手可见回复 MUST NOT 套用默认估算时长提示
