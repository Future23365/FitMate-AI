## MODIFIED Requirements

### Requirement: 动作必须具备训练阶段和角色元数据

系统 SHALL 为可被 AI 推荐、计划生成或 Patch 使用的动作维护结构化元数据，用于服务端校验训练阶段、角色、难度、风险和替代关系。缺少显式元数据时，系统 SHALL 使用保守推断；推断规则必须区分拉伸类动作和力量动作名称中的“伸展 / extension”，不得仅凭字面包含该词就把力量动作排除出主训练。

#### Scenario: 动作进入候选集合

- **WHEN** Exercise Retrieval Service 返回某个动作作为候选
- **THEN** 该动作 MUST 提供 `allowedSections`
- **AND** 该动作 MUST 提供可用于排序或校验的 `intensityRole`、`movementPattern`、`difficulty` 和 `equipment`
- **AND** 系统 SHOULD 提供 `riskTags`、`contraindications`、降阶、进阶或替代分组信息

#### Scenario: 动作缺少关键元数据

- **WHEN** 某个动作缺少 `allowedSections` 或难度等关键元数据
- **THEN** 系统 MUST 使用保守默认或将其排除出需要严格校验的候选池
- **AND** 系统 MUST NOT 让该动作绕过 Validator 直接进入可保存训练内容

#### Scenario: 力量动作名称包含伸展

- **WHEN** 动作名称、英文名或 ID 包含 `髋伸展`、`hip extension`、`leg extension`、`back extension` 或等价力量训练动作词
- **AND** 该动作没有显式 `allowedSections`
- **THEN** 元数据推断 MUST 允许该动作进入 `training`
- **AND** 系统 MUST NOT 将该动作推断为仅允许进入 `stretch`

#### Scenario: 明确拉伸动作仍进入拉伸

- **WHEN** 动作名称、分类、目标标签或描述明确表示 `拉伸`、`stretch`、`stretching`、`mobility` 或放松恢复
- **AND** 该动作没有显式 `allowedSections`
- **THEN** 元数据推断 MUST 允许该动作进入 `stretch`
- **AND** 系统 MUST NOT 因力量动作 disambiguation 规则把明确拉伸动作改成主训练动作
