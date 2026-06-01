## ADDED Requirements

### Requirement: 引用确认建议必须符合当前约束并保持可读

系统 SHALL 使用 `assistantSuggestions` 表达引用确认候选，并确保候选与当前用户的明确否定约束不冲突。

#### Scenario: 候选确认建议过滤约束冲突
- **WHEN** ReferenceResolver 返回 ambiguous candidates
- **AND** 当前消息表达不用某器械、不要某动作类型或等价否定约束
- **THEN** 服务端 MUST 优先生成符合该约束的 `assistantSuggestions`
- **AND** 明显违反该约束的候选 MUST 不得排在可见建议前列
- **AND** 如果所有候选都违反约束，服务端 MUST 返回生成新方案或重新说明条件的建议，而不是让用户确认违规候选

#### Scenario: 澄清建议可点击
- **WHEN** 服务端输出引用确认建议
- **THEN** 每条 suggestion 的 `message` MUST 是用户可直接发送的完整表达
- **AND** `label` MUST 足够短，适合渲染为 chip
- **AND** 自然语言正文中的候选列表 MUST 与 `assistantSuggestions` 的候选含义一致

#### Scenario: 建议来源进入 trace
- **WHEN** 服务端过滤、降权或生成引用确认建议
- **THEN** AI Trace MUST 记录建议来源、最终可见数量和因当前否定约束被过滤的候选数量或原因

