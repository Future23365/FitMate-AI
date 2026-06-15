## MODIFIED Requirements

### Requirement: `searchExerciseResources` 模型可见说明必须表达业务边界

系统 SHALL 在 tool manifest、schema 描述、examples、facet catalog 或 observation 中为模型提供 `searchExerciseResources` 的使用边界，且不得把该 tool 的业务特例写入通用 Agent prompt。该边界 SHALL 表达 tool 只接受数据库真实 facet、高层执行条件枚举、受控动作 id、受控动作名称和受控候选数量；高层自然语言目标由模型基于 `facetCatalog`、上下文和可见事实自主选择结构化字段。该边界 MUST NOT 表达业务目标满足度，也 MUST NOT 将查询结果包装成结构化训练交付流程或 section placement 建议。

#### Scenario: Manifest 说明高层执行条件输入来源
- **WHEN** Agent 构造 Planner 可见 tool description 和 schema description
- **THEN** `searchExerciseResources` 的模型可见说明 MUST 表达 `executionProfile` 用于选择动作执行场景，合法值为 `no_equipment`、`home_support`、`small_equipment`、`gym_equipment`、`partner_required` 和 `outdoor_required`
- **AND** 模型可见说明 MUST 表达宽泛动作推荐、动作筛选或结构化训练候选缺少明确器械 / 场地 / 可用设施偏好时，默认使用 `executionProfile = "no_equipment"` 作为低门槛无器械口径
- **AND** 模型可见说明 MUST 表达 `no_equipment` 表示完整无器械口径，允许地面或瑜伽垫，但不允许外部训练器械、椅子/墙面、健身房固定设施、搭档或户外空间
- **AND** 模型可见说明 MUST 表达 `home_support` 表示不需要外部训练器械，但允许地面/垫子、椅子、墙面或台阶等常见居家支撑
- **AND** 模型可见说明 MUST 表达 `home_support` 只应在用户明确可用椅子、墙面、台阶等常见居家支撑时使用
- **AND** 模型可见说明 MUST 表达 `small_equipment` 表示需要可移动的小型训练器械
- **AND** 模型可见说明 MUST 表达 `gym_equipment`、`partner_required` 和 `outdoor_required` 分别表示需要健身房固定设施/典型健身房器械、搭档辅助和户外空间
- **AND** 模型可见说明 MUST 表达 `impactLimit` 和 `noiseLimit` 是上限筛选，未知或未补齐值不匹配低冲击或安静约束
- **AND** 模型可见说明 MUST NOT 把自然语言短语写成固定 taxonomy 字段选择规则
- **AND** 通用 Agent prompt MUST NOT 新增 `searchExerciseResources` toolName 特例或服务端关键词路由规则

#### Scenario: 低门槛默认不暴露底层 taxonomy 输入
- **WHEN** Agent 构造 Planner 可见 tool description 和 schema description
- **THEN** 模型可见说明 MUST 继续只让模型填写 `executionProfile` 等高层执行条件
- **AND** 模型可见说明 MUST NOT 指示模型直接填写 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax` 或 `noiseLevelMax`
- **AND** handler、repository 和 execution taxonomy adapter MUST 继续负责 `executionProfile` 到底层 taxonomy 查询条件的确定性映射
