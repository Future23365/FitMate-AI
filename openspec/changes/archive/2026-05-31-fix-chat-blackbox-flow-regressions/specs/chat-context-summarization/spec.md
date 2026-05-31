## ADDED Requirements

### Requirement: 短指令必须沿用最近训练事实

系统 SHALL 在不暴露完整历史消息给 LLM 的前提下，让依赖上下文的短指令沿用最近已校验训练事实，并使用当前最新消息覆盖对应字段。

#### Scenario: 修改最近 routine 时长

- **WHEN** `conversationSummary` 或服务端内部上下文表明最近生成了居家背部 30 分钟 `routine`
- **AND** 用户输入“改成45分钟”
- **THEN** 系统 MUST 沿用最近的训练目标和场地条件
- **AND** 系统 MUST 将本次 `sessionMinutes` 更新为 45
- **AND** 系统 MUST 触发 `workout_routine`

#### Scenario: 动作推荐升级为 routine

- **WHEN** `conversationSummary` 或服务端内部上下文表明最近生成了胸部动作推荐
- **AND** 用户输入“把它变成20分钟训练”
- **THEN** 系统 MUST 将“它”解析为最近动作推荐的训练目标
- **AND** 系统 MUST 触发 `workout_routine`

#### Scenario: 当前消息覆盖历史器械条件

- **WHEN** 历史上下文记录用户有哑铃
- **AND** 用户输入“但今天不用器械”
- **THEN** 系统 MUST 使用当前消息覆盖历史器械条件
- **AND** 本轮训练意图 MUST 表达自重或无器械条件
