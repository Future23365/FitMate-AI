## ADDED Requirements

### Requirement: Agent tool 变更必须检查模型可见描述语言
系统 SHALL 要求新增或修改 Agent tool 时检查所有进入 Planner manifest 的描述性自然语言，确保默认使用中文并保留英文技术标识。

#### Scenario: 新增或修改 Agent tool manifest
- **WHEN** 后续 change 新增或修改 Agent tool 的 manifest、schema description 或 examples
- **THEN** OpenSpec tasks MUST 包含模型可见描述语言检查
- **AND** 实现 MUST 验证 `description`、`whenToUse`、`whenNotToUse`、`examples.description` 和 JSON Schema `description` 默认使用中文
- **AND** 实现 MUST NOT 翻译 `toolName`、input/output 字段名、enum、resource type 或 Action Validator 需要的结构化值
