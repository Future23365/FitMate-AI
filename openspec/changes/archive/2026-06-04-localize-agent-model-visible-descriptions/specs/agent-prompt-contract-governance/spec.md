## ADDED Requirements

### Requirement: 模型可见描述性 prompt 默认使用中文
系统 SHALL 要求所有 Agent prompt、model input、tool manifest、schema summary、examples、repair feedback、context package、observations、compressed tool results、AgentAction 输出格式说明和 final grounding 说明中的描述性自然语言默认使用中文。

#### Scenario: 审查模型可见描述字段
- **WHEN** 后续 change 修改 Agent prompt、model input、tool manifest、schema summary、examples、repair feedback、context package、observations 或 compressed tool results
- **THEN** 实现前 MUST 检查模型实际可见的描述性自然语言是否默认使用中文
- **AND** `toolName`、字段名、enum、action type、resource type、schema id、命令、路径和代码标识符 MUST 保持英文原样
- **AND** 如果必须保留英文原文，说明中 MUST 同时提供中文解释，且不得改变结构化合同含义

#### Scenario: 新增或修改业务 tool 模型可见说明
- **WHEN** 后续 change 新增或修改业务 Agent tool 的 `description`、`whenToUse`、`whenNotToUse`、schema description 或 examples
- **THEN** 这些描述性字段 MUST 使用中文说明业务能力边界、使用条件、禁止条件、成功结果、失败含义和 final answer 引用方式
- **AND** 技术标识、字段名和枚举值 MUST 保持原始英文值
