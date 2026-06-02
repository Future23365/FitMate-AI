## ADDED Requirements

### Requirement: Agent 修复循环必须有 token 和 step 预算
系统 SHALL 为 Agent 决策修复循环设置独立预算，并在模型上下文中控制错误反馈数量和大小。

#### Scenario: 进入修复循环
- **WHEN** runtime 生成可恢复 `AgentDecisionFeedback`
- **THEN** token budget 决策 MUST 记录本轮已使用 repair turn 数和剩余 repair 预算
- **AND** 模型请求 MUST 只包含修复所需的错误摘要、资源 id 和推荐下一步
- **AND** 模型请求 MUST NOT 因修复反馈包含完整大 payload

#### Scenario: 修复预算超过限制
- **WHEN** repair turn、同类错误次数或总 step 数超过配置预算
- **THEN** 系统 MUST 停止继续发起修复模型调用
- **AND** trace MUST 记录预算耗尽原因
- **AND** 用户可见回复 MUST 使用标准失败或 blocked 投影

### Requirement: 重复错误反馈必须压缩模型可见上下文
系统 SHALL 压缩同一 run 中重复失败的模型可见反馈，避免相同错误在上下文中反复累积。

#### Scenario: 相同失败重复出现
- **WHEN** 同一 `toolName + normalizedInput + failureCode` 重复出现
- **THEN** 模型可见上下文 MUST 只保留压缩后的失败摘要
- **AND** 摘要 MUST 包含 failure code、repeat count、firstToolResultId、latestToolResultId 和推荐替代路径
- **AND** trace MUST 继续保留每一次原始决策和熔断 step

#### Scenario: 不同输入产生失败
- **WHEN** 模型修改工具输入后再次失败
- **THEN** 系统 MUST 将其视为新的尝试
- **AND** token 压缩 MUST NOT 合并不同 normalized input 的失败事实
