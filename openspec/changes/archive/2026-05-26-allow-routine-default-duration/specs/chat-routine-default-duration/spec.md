## ADDED Requirements

### Requirement: 明确动作列表的单次训练使用默认估算时长

当用户提供明确动作列表并要求编成单次训练、动作组或训练流程时，系统 SHALL 允许使用默认或估算的 `sessionMinutes` 触发 `workout_routine`，即使用户没有显式说明训练时长。

#### Scenario: 用户给出动作列表但没有说明时长

- **WHEN** 用户要求“把这批动作编成一套训练”并列出具体动作名称
- **THEN** 意图解析结果 MUST 为 `routine`
- **THEN** `canTriggerAction` MUST 为 `true`
- **THEN** `missingActionFields` MUST NOT 包含 `sessionMinutes`

### Requirement: 默认估算时长需要在可见回复中提示

当系统为明确动作列表的单次训练使用默认或估算时长时，聊天可见回复 SHALL 用自然语言说明用户没有提供具体训练时长，系统会先按默认估算生成，并提示用户可以继续补充时长调整。

#### Scenario: 使用默认估算时长生成单次训练

- **WHEN** 用户提供明确动作列表并要求生成单次训练，但没有提供训练时长
- **THEN** 助手可见回复 MUST 提示当前使用默认估算时长
- **THEN** 助手可见回复 MUST 提示用户可以补充具体时长用于调整
- **THEN** 助手可见回复 MUST NOT 直接列出训练动作清单

### Requirement: 宽泛单次训练请求仍需补充信息

当用户没有提供明确动作列表，也缺少目标、时长、器械或场地等关键信息时，系统 SHALL 继续追问缺失信息，不得仅凭默认估算时长触发单次训练生成。

#### Scenario: 宽泛请求没有足够上下文

- **WHEN** 用户只说“今天练什么”或“帮我安排一下”，且没有明确动作列表、目标、时长、器械或场地
- **THEN** `canTriggerAction` MUST 为 `false`
- **THEN** 助手 MUST 追问缺失信息或提供可点击的补充信息回复
