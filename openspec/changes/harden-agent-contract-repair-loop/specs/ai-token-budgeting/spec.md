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

### Requirement: Agent prompt modules 必须指导模型消费修复反馈
系统 SHALL 更新 Agent prompt modules，使模型能识别 `AgentDecisionFeedback` 并基于结构化反馈继续决策，同时不得把 prompt 作为执行合同、权限或事实来源。

#### Scenario: agent_tool_decision 读取 feedback
- **WHEN** 模型请求包含 `AgentDecisionFeedback` 或 `agentDecisionFeedback` tool result
- **THEN** `agent_tool_decision` prompt MUST 指示模型优先读取 feedback 的 `code`、`availableResources`、`missingResources`、`recommendedNextTool`、`recommendedInput`、`hardBoundary` 和重复失败摘要
- **AND** 如果 `recommendedNextTool` 存在且不违反当前上下文，模型 SHOULD 优先调用该工具
- **AND** prompt MUST 明确禁止伪造 `revisionId`、`validationId`、`policyDecisionId`、`operationResultId` 或其他未登记资源

#### Scenario: agent_tool_execution 不允许盲目重试
- **WHEN** 工具结果包含失败、重复失败或 feedback 摘要
- **THEN** `agent_tool_execution` prompt MUST 指示模型只能基于结构化 tool result、feedback、dependency graph 和资源合同修复
- **AND** prompt MUST 明确 `retryable: true` 不是继续重试的充分条件
- **AND** prompt MUST 明确模型不得从用户自然语言、自由文本回复或 `conversationSummary` 补造资源 id

#### Scenario: agent_final_result 强化终止引用合同
- **WHEN** 模型准备返回 final result
- **THEN** `agent_final_result` prompt MUST 明确 generated、patched 和 completed_operation 只能引用当前 run 已登记 tool result
- **AND** prompt MUST 明确 `patched` 必须同时引用 patch 工具结果和保存结果
- **AND** prompt MUST 明确 `completed_operation` 必须引用真实写工具产生的 `operationResultId`
- **AND** prompt MUST 明确多候选事实无法唯一确定时不得猜测成功结果

#### Scenario: prompt 不承担服务端合同判定
- **WHEN** prompt module 描述 feedback 消费方式
- **THEN** prompt MUST NOT 引入自然语言关键词分流、同义词匹配、权限判断、Policy 判断或用户数据归属判断
- **AND** runtime MUST 继续执行可恢复性、资源引用、熔断和 final projection 的确定性校验
