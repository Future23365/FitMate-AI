## ADDED Requirements

### Requirement: Agent 工具 Schema 摘要必须保留 union 分支字段

Agent decision 模型输入在瘦身 registry 工具定义时，SHALL 保留模型正确调用工具所需的 Schema 边界。对于 `oneOf`、`anyOf` 或等价 discriminated union 工具 Schema，摘要 MUST 包含各分支的必填字段和判别字段取值。

#### Scenario: evaluatePolicy 使用 new_artifact 分支
- **WHEN** Agent registry 暴露 `evaluatePolicy` 工具
- **AND** 该工具 Schema 包含 `policyTarget="new_artifact"` 分支
- **THEN** 模型可见摘要 MUST 包含 `policyTarget` 的 `new_artifact` 判别值
- **AND** 模型可见摘要 MUST 标记 `artifactKind` 为必填字段
- **AND** 模型可见摘要 MUST 标记 `draftId` 为必填字段
- **AND** 模型可见摘要 MUST NOT 将该工具显示为无输入字段

#### Scenario: 普通 object 工具 Schema
- **WHEN** Agent registry 暴露普通 object 工具 Schema
- **THEN** 模型可见摘要 MUST 继续包含根级字段、必填状态、枚举、数组 item 和基础数值边界
- **AND** 系统 MUST NOT 因支持 union schema 而回退发送完整未瘦身 schema
