## ADDED Requirements

### Requirement: 默认 prompt 必须区分目标肌群推荐和宽泛参与查询
系统 SHALL 在默认 LangChain Agent prompt 中表达稳定 Planner Policy：当用户请求按目标肌群推荐、筛选或生成训练动作候选时，模型应把请求肌群理解为主练目标；当用户目标是查询某肌群是否参与、动作会带到哪些肌群、辅助刺激或宽泛相关动作时，模型可以使用主/辅任意参与口径。该规则 MUST 使用稳定语义类别表达，不得依赖具体用户短句或关键词。

#### Scenario: 目标肌群推荐默认主练口径
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 表达目标肌群动作推荐、训练动作筛选或结构化训练结果候选默认按主练肌群理解
- **AND** system message MUST 表达模型不应把所有辅助参与该肌群的动作都当作同等优先的目标肌群推荐候选
- **AND** system message MUST NOT 使用具体用户原话、固定短语、关键词或正则作为触发条件

#### Scenario: 宽泛参与语义允许任意匹配口径
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 表达当用户目标是肌群参与、带到、辅助刺激、稳定参与或宽泛相关动作时，可以使用主/辅任意参与口径
- **AND** system message MUST 表达这种口径返回的是参与候选，不代表每个候选都适合作为目标肌群主练推荐

### Requirement: 默认 prompt 必须表达候选足够时停止同类查询
系统 SHALL 在默认 LangChain Agent prompt 中表达：成功工具结果已经提供与当前目标匹配的可用候选时，模型应基于候选子集回答、提交结构化训练结果、澄清或说明事实不足，而不得为了扩大候选池、移除未选候选或追求候选池完全纯净而重复调用同类只读查询工具。

#### Scenario: 成功候选支持选择子集收口
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 表达工具返回的候选池可以选择子集用于最终回答或结构化训练结果
- **AND** system message MUST 表达未选择候选不需要通过再次查询移除
- **AND** system message MUST 表达候选池已经按主练肌群匹配时，不应仅为了查看更多候选而重复同类查询

#### Scenario: 不引入固定 workflow 或业务 toolName 触发规则
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 根据具体业务 `toolName`、字段组合、用户关键词或用户短句规定必须选择固定下一步
- **AND** system message MUST NOT 要求服务端根据用户原文自动补写 tool input 字段
- **AND** system message MUST NOT 把 `searchExerciseResources` 的成功结果描述成必须经过固定下一步 workflow 才能用于普通文本回答
