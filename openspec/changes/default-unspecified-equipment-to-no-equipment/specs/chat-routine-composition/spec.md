## ADDED Requirements

### Requirement: 未指定器械的 routine 必须默认无器械

用户请求生成单次训练 routine 时，若当前消息、已确认上下文和用户记忆中都没有正向可用器械或居家条件，系统 SHALL 默认按无器械 / 自重训练生成。该默认 SHALL 同时体现在动作候选集合、routine intent、draft、validation evidence 和保存后的 artifact 摘要中。

#### Scenario: 目标和时长已足够但未指定器械
- **WHEN** 用户输入“今天练胸30分钟”或等价单次 routine 请求
- **AND** Agent 没有读取到正向可用器械或居家条件
- **THEN** 系统 MUST 使用无器械或自重候选生成 routine
- **AND** `generateRoutineDraft` 的 `intent.equipment` 或等价字段 MUST 表达无器械 / 自重边界
- **AND** 系统 MUST NOT 因缺少器械条件追问用户

#### Scenario: 用户明确提供可用器械
- **WHEN** 用户输入“我有哑铃，今天练胸30分钟”或等价 routine 请求
- **THEN** 系统 MUST 使用哑铃或动作库真实等价器械 facet 构建 routine 候选
- **AND** routine intent、draft 和保存后的 artifact MUST 保留该器械边界
- **AND** 系统 MUST NOT 用默认无器械覆盖用户明确可用器械

#### Scenario: 当前消息覆盖历史器械
- **WHEN** 已确认上下文中存在可用器械事实
- **AND** 当前用户消息明确表示“今天不用器械”“没有器械”或等价无器械条件
- **THEN** 当前消息的无器械条件 MUST 覆盖历史器械事实
- **AND** 本轮 routine MUST 使用无器械或自重候选生成

#### Scenario: 历史确认器械仍可使用
- **WHEN** 当前用户消息没有提到器械
- **AND** 同一会话或用户记忆中存在已确认的正向可用器械事实
- **THEN** 系统 MAY 使用该已确认器械作为 routine 候选边界
- **AND** 系统 MUST NOT 在该事实仍有效时自动改成默认无器械
