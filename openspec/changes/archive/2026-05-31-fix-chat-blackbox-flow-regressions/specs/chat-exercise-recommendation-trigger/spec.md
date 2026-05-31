## MODIFIED Requirements

### Requirement: 目标明确的动作推荐必须触发内部推荐事件

当用户请求某个训练目标、身体部位或动作类别的纯动作推荐时，系统 SHALL 在动作候选可用时触发 `exercise_recommendation` 内部动作事件，即使用户没有说明器械、场地或训练时长。用户使用“今天”“这次”“那我今天”等自然承接表达时，如果没有要求训练流程、组数次数、休息、顺序或长期计划，系统仍 SHALL 保持纯动作推荐语义。

#### Scenario: 用户只说明训练部位

- **WHEN** 用户输入“我想练腿”
- **AND** 意图解析结果使用顶层 `type = "exercise_recommendation"`
- **AND** 动作候选状态为 `enough` 或 `limited_but_usable`
- **THEN** 系统 MUST 触发 `exercise_recommendation` 内部动作事件
- **AND** 系统 MUST NOT 因为缺少 `equipmentOrLocation` 阻断动作推荐

#### Scenario: 用户只要求推荐动作

- **WHEN** 用户输入“推荐几个练腿动作”
- **AND** 动作候选状态为 `enough` 或 `limited_but_usable`
- **THEN** 系统 MUST 触发 `exercise_recommendation` 内部动作事件
- **AND** 系统 MUST NOT 强制要求用户先提供单次训练时长

#### Scenario: 用户以今天表达纯动作目标

- **WHEN** 用户输入“今天我想练胸”或“那我今天练胸”
- **AND** 用户没有要求训练流程、组数次数、休息、顺序或计划
- **AND** 动作候选状态为 `enough` 或 `limited_but_usable`
- **THEN** 系统 MUST 触发 `exercise_recommendation` 内部动作事件
- **AND** 系统 MUST NOT 追问器械、场地或训练时长
