## ADDED Requirements

### Requirement: `searchExerciseResources` 模型可见合同必须限制 `muscles` 来源和泛化请求拆分

`searchExerciseResources` 模型可见说明 SHALL 表达 `muscles` 是动作库查询筛选条件，只能来自用户明确指定的目标肌群、已验证上下文中的目标肌群，或模型为当前可执行训练课收敛出的少量必要目标。该说明 MUST 禁止模型把宽泛训练目标、常规训练知识或未指定肌群扩展成全身肌群 inventory 查询。

#### Scenario: `muscles` 字段来源受控

- **WHEN** 模型准备填充 `searchExerciseResources.muscles`
- **THEN** 模型可见 schema description MUST 表达字段来源包括用户明确目标、已验证上下文目标，或当前可执行训练课已收敛的少量必要目标
- **AND** 模型可见 schema description MUST 表达不要把未指定肌群、宽泛训练目标或常规训练知识展开成全身肌群清单
- **AND** schema description MUST 保持字段名、枚举值和执行合同不变

#### Scenario: broad query 已可支撑 routine 时不得继续肌群 inventory

- **WHEN** 用户没有指定具体肌群
- **AND** broad query 已返回可用于当前 `routine` 的 `training` 候选
- **THEN** `searchExerciseResources` 模型可见说明 MUST 表达不要为了完整覆盖继续拆成胸、背、腿、肩、手臂、核心或等价全身肌群查询
- **AND** 模型可见说明 MUST 引导模型消费已有候选进入结构化收口、追问阻塞条件或说明边界
- **AND** 模型可见说明 MUST NOT 把未指定肌群包装成缺失数据库动作事实

#### Scenario: 明确肌群或全身覆盖请求仍可查询

- **WHEN** 用户明确指定目标肌群、身体部位、分化训练或全身覆盖
- **THEN** `searchExerciseResources` 模型可见说明 MAY 允许模型把明确范围转换成 `muscles` 查询条件
- **AND** 多 `muscles` 查询结果仍 MUST 被描述为候选事实，不保证每个候选都同等适合最终推荐
- **AND** 模型可见说明 MUST 表达最终输出不要求使用全部候选
