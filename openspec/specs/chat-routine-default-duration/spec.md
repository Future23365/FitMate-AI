# chat-routine-default-duration Specification

## Purpose
TBD - created by archiving change allow-routine-default-duration. Update Purpose after archive.
## Requirements
### Requirement: 明确动作列表的单次训练使用默认估算时长

当用户提供明确动作列表并要求编成单次训练、动作组或训练流程时，系统 SHALL 允许使用默认或估算的 `sessionMinutes` 触发 `workout_routine`，即使用户没有显式说明训练时长。

#### Scenario: 用户给出动作列表但没有说明时长

- **WHEN** 用户要求“把这批动作编成一套训练”并列出具体动作名称
- **THEN** 意图解析结果 MUST 为 `routine`
- **THEN** `canTriggerAction` MUST 为 `true`
- **THEN** `missingActionFields` MUST NOT 包含 `sessionMinutes`

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

### Requirement: 宽泛单次训练请求仍需补充信息

当用户没有提供明确动作列表，也缺少目标、时长、器械或场地等关键信息时，系统 SHALL 继续追问缺失信息，不得仅凭默认估算时长触发单次训练生成。

#### Scenario: 宽泛请求没有足够上下文

- **WHEN** 用户只说“今天练什么”或“帮我安排一下”，且没有明确动作列表、目标、时长、器械或场地
- **THEN** `canTriggerAction` MUST 为 `false`
- **THEN** 助手 MUST 追问缺失信息或提供可点击的补充信息回复

