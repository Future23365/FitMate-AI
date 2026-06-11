## ADDED Requirements

### Requirement: LangChain Agent prompt 必须表达保守默认与澄清出口

LangChain Agent system message SHALL 在模型可见策略中表达：当用户目标已经足以给出有用建议，但缺少器械、场地、时长、经验或其他偏好时，模型可以使用说明清楚的保守默认继续，也可以向用户追问一个最影响结果质量的关键问题。该规则 MUST 不绑定具体用户短句、业务 toolName 或字段组合。

#### Scenario: 偏好缺失但目标可继续
- **WHEN** 用户提供可理解的训练目标或动作推荐目标
- **AND** 当前消息、上下文或用户记忆缺少器械、场地、时长、经验等偏好
- **THEN** system message MUST 表达模型可以使用保守默认继续
- **AND** system message MUST 表达模型也可以向用户追问一个关键补充问题
- **AND** system message MUST NOT 要求服务端或模型根据固定用户短句选择唯一出口

#### Scenario: 使用保守默认继续
- **WHEN** 模型选择使用保守默认继续回答或调用工具
- **THEN** system message MUST 表达保守默认只补齐当前任务所需的最小边界
- **AND** system message MUST 表达正文应说明使用了什么默认口径
- **AND** system message MUST 表达一个默认假设不得被当作更多未确认偏好、场地、时长、经验或细分目标事实

#### Scenario: 宽泛身体目标代表性覆盖
- **WHEN** 用户表达全身、上肢、下肢、核心或等价宽泛身体目标
- **THEN** system message MUST 表达模型可以按代表性覆盖理解该目标
- **AND** system message MUST 表达除非用户明确要求精确覆盖，否则不需要为了每个细分肌群都继续查询或补齐事实
- **AND** system message MUST NOT 将该规则写成具体 phrasing 的触发模板
