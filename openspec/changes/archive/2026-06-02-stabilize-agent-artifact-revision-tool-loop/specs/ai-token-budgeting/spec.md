## ADDED Requirements

### Requirement: Agent tool loop 必须压缩重复失败上下文
系统 SHALL 在构造下一轮模型可见 Agent tool result 上下文时压缩同一工具、同一归一化输入、同一失败码的重复失败结果。

#### Scenario: 多次相同工具失败进入模型上下文
- **WHEN** 单次 Agent run 内出现多个相同工具、相同归一化输入、相同失败码的失败结果
- **THEN** 模型可见上下文 MUST 只包含一条合并后的失败摘要或等价压缩表示
- **AND** 摘要 MUST 包含失败码、失败原因、首次失败 tool result id、最新失败 tool result id 和重复次数
- **AND** trace MUST 继续保留原始工具决策和执行证据

#### Scenario: 不同失败不能错误合并
- **WHEN** 工具失败的工具名、归一化输入或失败码不同
- **THEN** 系统 MUST NOT 将这些失败合并成同一条模型可见摘要
- **AND** 模型上下文 MUST 保留足够信息区分不同恢复路径
