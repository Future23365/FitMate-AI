## ADDED Requirements

### Requirement: Agent 读工具必须暴露动作 facet 使用边界
系统 SHALL 在统一 `AgentToolRegistry` 的动作读工具摘要中暴露必要的筛选边界，使模型能区分真实动作 facet、高层身体区域和自由文本查询。

#### Scenario: Agent 查看 searchExercises 工具定义
- **WHEN** Agent decision prompt 包含 `searchExercises` 工具定义
- **THEN** 工具摘要 MUST 描述 `targetMuscles` 只能使用动作库真实肌群 facet
- **AND** 工具摘要 MUST 描述高层身体区域应使用 `bodyRegions`
- **AND** 工具摘要 MUST 提供可用于常见训练请求的身体区域枚举

#### Scenario: searchExercises 返回失败
- **WHEN** Agent registry 中的 `searchExercises` 工具返回失败
- **THEN** 失败结果 MUST 保留结构化 `detail`
- **AND** `detail` MUST 能表达该失败是否可恢复
- **AND** Agent 后续决策 prompt MUST 能看到可用于 retry 的诊断摘要
