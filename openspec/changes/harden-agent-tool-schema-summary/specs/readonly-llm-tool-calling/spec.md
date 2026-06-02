## MODIFIED Requirements

### Requirement: Agent registry 必须暴露模型可执行的工具输入摘要

系统 SHALL 在统一 `AgentToolRegistry` 暴露给 Agent decision 模型的工具定义中提供可执行的轻量输入摘要。该摘要 MUST 保留完成工具调用所需的结构边界，并 MUST NOT 只提供复杂字段的顶层字段名。

#### Scenario: 模型查看包含嵌套对象的工具定义

- **WHEN** Agent decision prompt 包含带有对象字段的工具定义
- **THEN** 工具输入摘要 MUST 在受控深度内暴露该对象字段的子字段
- **AND** 子字段摘要 MUST 保留 required、enum、const、default、数组 item 和数值边界等结构信息
- **AND** 摘要 MUST 保持轻量，不得把完整 JSON Schema 原样发送给模型

#### Scenario: 模型查看包含 record 字段的工具定义

- **WHEN** Agent decision prompt 包含 `z.record` 或 JSON Schema `additionalProperties` 形态的工具字段
- **THEN** 工具输入摘要 MUST 暴露动态 key 对应的 value 结构
- **AND** 当 value 是对象时，摘要 MUST 在受控深度内暴露其子字段

#### Scenario: 模型查看 searchExercises 工具定义

- **WHEN** Agent decision prompt 包含 `searchExercises` 的工具定义
- **THEN** 摘要 MUST 表达 `resultRequirements.sectionCoverage` 是 record/object 结构
- **AND** 摘要 MUST 表达 `sectionCoverage` 的 value 包含 `min`
- **AND** 摘要 MUST 表达 `softPreferences` 只接受已声明的偏好字段
- **AND** 摘要 MUST 表达 `query` 是顶层字段，而不是 `softPreferences.query`

#### Scenario: 模型查看复杂生成和策略工具定义

- **WHEN** Agent decision prompt 包含 `generateRoutineDraft`、`generatePlanDraft` 或 `evaluatePolicy` 的工具定义
- **THEN** 摘要 MUST 暴露 `intent`、`strategy` 或 union 分支中的关键字段结构
- **AND** union 分支 MUST 保留判别字段的 const 或 enum 边界
- **AND** 模型 MUST 能从摘要中区分不同分支的必填字段
