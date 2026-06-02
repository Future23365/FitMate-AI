## ADDED Requirements

### Requirement: 动作候选池必须支持身体区域展开
动作检索服务 SHALL 支持从受控身体区域枚举展开真实动作肌群 facet，并用展开后的 facet 构建候选池。

#### Scenario: 构建上肢候选池
- **WHEN** 动作检索输入包含 `bodyRegions = ["upper_body"]`
- **THEN** 候选池 MUST 使用当前动作库真实上肢肌群 facet 检索动作
- **AND** 候选池 MUST 继续遵守 `allowedSections`、器械、发布状态和风险排除等确定性过滤条件

#### Scenario: 身体区域展开没有匹配动作
- **WHEN** 身体区域展开后仍无法获得候选
- **THEN** 检索 diagnostics MUST 记录展开后的肌群 facet
- **AND** 检索 diagnostics MUST 记录空候选失败原因
