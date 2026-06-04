## ADDED Requirements

### Requirement: Tool manifest 描述字段必须具备中文说明
系统 SHALL 在 tool manifest hardening 或等价 registry manifest 测试中检查 Planner 可见描述性字段，防止英文说明作为默认 prompt 暴露给模型。

#### Scenario: 序列化 Planner manifest
- **WHEN** `ToolRegistry` 序列化可进入 Planner 的 tool manifest
- **THEN** manifest 顶层 `description`、`whenToUse`、`whenNotToUse` 和 `examples.description` MUST 包含中文说明
- **AND** input / output JSON Schema 中的 `description` MUST 包含中文说明
- **AND** manifest linter 或回归测试 MUST 允许字段名、enum、resource type、toolName、schema id 和示例 input 中的结构化值保持英文

#### Scenario: 描述字段缺少中文说明
- **WHEN** tool manifest 的描述性字段完全没有中文说明
- **THEN** manifest hardening MUST 报告不合格或相关 registry manifest 测试 MUST 失败
- **AND** 不合格 manifest MUST NOT 被视为符合生产模型可见合同
