## MODIFIED Requirements

### Requirement: Agent 决策合同失败必须生成结构化反馈
系统 SHALL 在 Agent 模型决策违反可恢复执行合同时生成结构化 `AgentDecisionFeedback` 或等价模型可见 repair feedback，并将该反馈作为下一轮模型可见的工具结果摘要或 invalid action observation，而不是只返回通用 `model_output_invalid` 或泛化 schema 失败消息。

#### Scenario: ToolResult 失败进入反馈上下文
- **WHEN** tool 返回结构化失败、权限失败、schema 失败、resource contract 失败或不可重试执行失败
- **THEN** runtime MUST 将该结果作为失败事实和模型可见摘要登记
- **AND** runtime MUST NOT 把该结果登记为可被后续工具消费的成功资源
- **AND** runtime MUST NOT 从用户原文、query、title、summary 或 `conversationSummary` 推断额外修复参数
- **AND** runtime MUST NOT 把 `ok = true` 但返回 0 条或候选不足的查询结果归类为执行失败

#### Scenario: 0 条成功结果不是 repair failure
- **WHEN** tool 成功执行并返回 0 条结果、空候选或候选不足诊断
- **AND** 该 result 满足 `ok = true`
- **THEN** runtime MUST 将该 result 作为 current-run 事实材料提供给 Planner
- **AND** runtime MUST 允许 Planner 引用该 result 输出普通 `final_answer` 解释空结果
- **AND** runtime MUST NOT 因中间结果未满足业务目标而强制进入 repair failure
- **AND** 如果 Planner 随后提交结构化 `visibleOutputs`，是否成功 MUST 由对应 terminal output validator 判定

### Requirement: Agent 修复循环必须受预算和熔断约束
系统 SHALL 对 Agent 决策修复循环设置明确预算，并对重复不可重试失败或重复输入执行确定性熔断。

#### Scenario: 重复工具输入被反馈
- **WHEN** 模型重复调用相同 `toolName + toolVersion + normalizedInputHash`
- **AND** 当前 run 已存在该输入对应的 tool result
- **THEN** runtime SHOULD NOT 再次执行底层工具
- **AND** runtime MUST 返回结构化 duplicate input feedback
- **AND** feedback MUST 引用既有 `toolResultId` 和重复次数
- **AND** feedback MUST 说明重复相同 input 不会产生新事实
- **AND** feedback MUST NOT 使用 `success` / `satisfied` 等词表达业务目标已经满足或未满足
- **AND** feedback MUST NOT 指定 Planner 必须调用某个具体业务 tool、固定 action 或固定 tool input

### Requirement: 重复成功 tool 调用必须生成收口反馈
系统 SHALL 在同一 run 中识别重复的成功 tool 调用，并以结构化 `AgentDecisionFeedback` 或等价 Planner 可见 feedback 引导 Planner 基于已有结果收口或提交新的合法 action，而不是再次执行同一 handler、重复登记 resource 或耗尽 repair 预算。

#### Scenario: 已有同等结果时重复调用
- **WHEN** Planner 返回 `tool_call`
- **AND** 当前 run 已存在相同 `toolName + toolVersion + normalizedInputHash` 的 tool result
- **AND** 该既有 tool result 满足 `ok = true`
- **THEN** runtime MUST NOT 再次执行相同 tool handler
- **AND** runtime MUST 生成结构化 duplicate input feedback
- **AND** feedback MUST 引用既有 `toolResultId`
- **AND** feedback MUST 说明 Planner 可以基于既有结果输出合法 terminal action、调用其他当前可见合法 tool、提交改变后的合法 tool input、ask_user 或失败收口
- **AND** feedback MUST NOT 因既有 result 返回 0 条、候选不足或业务诊断而改变 duplicate input 的通用边界

#### Scenario: 重复反馈不替代语义判断
- **WHEN** runtime 生成重复 tool input feedback
- **THEN** feedback MUST NOT 根据用户原文关键词、正则、同义词表或短句模板判断用户是否要求刷新、更多结果、放宽条件或排除已展示动作
- **AND** feedback MUST NOT 代替 Planner 生成用户可见回答内容
- **AND** feedback MUST NOT 改写 Planner 的高层语义 action
- **AND** feedback MUST NOT 写入具体业务 `toolName` 分支来替代通用重复输入边界

### Requirement: terminal visible output 失败必须作为结构化 invalid action observation 反馈
系统 SHALL 在 `final_answer.visibleOutputs[]` 通过静态 envelope 但未通过业务 terminal output validator 时，把失败结果作为结构化 invalid action observation 提供给下一轮 Planner。反馈 MUST 保留 output index、`outputType`、`schemaVersion` 和业务 validator 返回的脱敏 details。反馈 MUST NOT 把业务流程建议写成固定下一步。

#### Scenario: 最终输出失败才表示结构化交付失败
- **WHEN** Planner 返回 `final_answer.visibleOutputs[]`
- **AND** 对应 terminal output validator 判定 payload 不满足数据库事实、数量、section、prescription、schedule 或其他确定性业务边界
- **THEN** runtime MUST 拒绝该结构化输出
- **AND** runtime MUST 将失败作为 invalid action observation 或 terminal validation failure 反馈
- **AND** runtime MUST NOT 把中间 tool result 的空结果、候选不足或诊断字段直接当作该结构化输出失败的替代判定
- **AND** feedback MUST NOT 要求 Planner 必须调用某个具体 tool
