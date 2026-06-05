## ADDED Requirements

### Requirement: Planner 模型输入不得重复传递成功 tool result 的详细事实
系统 SHALL 在构造 production Planner 模型输入时，为成功且已满足的 tool result 选择单一权威详细事实通道。详细模型可见事实 MUST 保留在 redacted `toolResults[].projection.model` 或等价安全 projection 中，`observations` 中对应条目只能作为轻量索引和导航摘要。

#### Scenario: 成功 tool result 同时存在 observation 和 toolResults
- **WHEN** 当前 run 已有 `ok = true` 且 `fulfillment.satisfied = true` 的 tool result
- **AND** Runtime 准备构造下一轮 Planner 模型输入
- **THEN** `toolResults[]` MUST 保留该结果的安全 `projection.model`、fulfillment 摘要、`toolResultId` 和可验证引用
- **AND** 对应 `observations[]` MUST NOT 再包含同一份完整 `projection.model`
- **AND** 对应 `observations[]` MUST 只保留 `toolResultId`、`toolName`、`ok`、`fulfillment.satisfied`、必要 resource / grounding 摘要和“详细事实见 toolResults”或等价边界说明
- **AND** 模型输入 MUST NOT 默认包含完整 handler `output`

#### Scenario: repair 和 diagnostic observation 保持可见
- **WHEN** observation 来源是 failed tool result、diagnostic tool result、`fulfillment.satisfied = false`、invalid action、duplicate success feedback 或 runtime error
- **THEN** `observations[]` MUST 继续保留结构化 code、details、repair facts、recoverable actions 和安全摘要
- **AND** 这些 observation MUST 继续可用于下一轮 Planner 修复、澄清、阻断说明或失败收口
- **AND** 系统 MUST NOT 因去重成功 tool facts 而删除 repair / diagnostic observation

#### Scenario: 模型输入描述语言保持中文边界
- **WHEN** 新增或调整 observations / compressed tool results 中的模型可见说明
- **THEN** 描述性自然语言 MUST 使用中文
- **AND** `toolName`、字段名、enum、action type、resource type、schema id、错误码和代码标识符 MUST 保持英文原样

