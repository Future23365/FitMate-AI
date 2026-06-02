## MODIFIED Requirements

### Requirement: Exercise search 必须可作为只读 LLM 工具执行
系统 SHALL 提供受控 `searchExercises` 工具，让 LLM 可以按结构化条件补查动作摘要。

#### Scenario: LLM 触发动作检索
- **WHEN** LLM 通过只读 tool loop 请求 `searchExercises`
- **THEN** 系统 MUST 使用受控动作查询服务执行检索
- **AND** 检索 MUST 遵守动作库可见性、器械、肌群、section、训练目标和用户反馈边界
- **AND** 返回给模型的结果 MUST 是动作摘要、动作 id 和可解释匹配原因

#### Scenario: 动作检索结果用于推荐解释
- **WHEN** 工具结果用于解释动作推荐或替代候选
- **THEN** 回复 MUST 只引用工具结果中的真实动作
- **AND** 系统 MUST NOT 生成不存在于数据库的 exerciseId

#### Scenario: 推荐检索已有结构化候选边界
- **WHEN** `searchExercises` 使用 `candidateUse="recommendation"` 执行动作检索
- **AND** 请求包含 `bodyRegions`、`targetMuscles`、`equipmentRequired`、`equipment`、`allowedSections`、`goal` 或 `sessionMinutes` 等结构化候选边界
- **THEN** 系统 MUST 先执行结构化 hard filters
- **AND** `query` MUST 只作为候选排序提示
- **AND** `query` MUST NOT 作为硬召回条件清空已满足结构化边界的候选
- **AND** 若仍无候选，诊断原因 MUST 指向结构化过滤结果或 facet 问题，而不是误报为单纯 `no_hybrid_match`
