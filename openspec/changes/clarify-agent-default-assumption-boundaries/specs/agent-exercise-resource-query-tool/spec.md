## ADDED Requirements

### Requirement: `searchExerciseResources` 模型可见说明必须表达多肌群结果的消费边界

`searchExerciseResources` 的模型可见 description、schema description 或 observation SHALL 表达：多 `muscles` 查询用于获得代表性候选覆盖，`zeroMatchMuscles` 是当前 section 和当前过滤条件下的诊断事实，可用于解释、澄清或调整查询，但不是必须继续补查每个肌群的义务。

#### Scenario: 多肌群候选用于代表性覆盖
- **WHEN** production registry 序列化 `searchExerciseResources` manifest、schema description 或等价模型可见说明
- **THEN** 模型可见说明 MUST 表达多 `muscles` 查询用于获得代表性候选覆盖
- **AND** 模型可见说明 MUST NOT 表达 `groups.<section>.exercises[]` 必须覆盖每个请求肌群后才能收口

#### Scenario: zeroMatchMuscles 是诊断事实
- **WHEN** `searchExerciseResources` observation 暴露 `groups.<section>.zeroMatchMuscles`
- **THEN** observation MUST 表达 `zeroMatchMuscles` 可用于解释、澄清或调整查询
- **AND** observation MUST 表达 `zeroMatchMuscles` 不要求固定继续调用 `searchExerciseResources` 或任何特定 tool
- **AND** observation MUST NOT 把 `zeroMatchMuscles` 描述成用户目标失败、动作库永久缺失或最终输出不可收口

### Requirement: `homeRequirement` 模型可见说明必须表达输入来源边界

`searchExerciseResources` 的 `homeRequirement` schema description 或 tool description SHALL 表达该字段只在用户目标、上下文、已验证事实或当前规划确实需要环境、场地或支撑条件时填写。省略 `homeRequirement` SHALL 表示不额外限定环境条件。

#### Scenario: homeRequirement 只表达环境场地约束
- **WHEN** production registry 序列化 `searchExerciseResources` input schema
- **THEN** `homeRequirement` 的模型可见说明 MUST 表达它只表示环境、场地或支撑条件
- **AND** 说明 MUST 表达无外部器械约束应使用 `equipment = "no_equipment"`
- **AND** 说明 MUST 表达省略 `homeRequirement` 表示不额外限定环境条件

#### Scenario: homeRequirement 不承接保守默认
- **WHEN** 用户目标缺少环境、场地或支撑条件偏好
- **THEN** 模型可见说明 MUST 允许 Planner 不填写 `homeRequirement`
- **AND** `/api/chat`、LangChain runtime、tool wrapper、handler 和 repository MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板自动补写 `homeRequirement`
