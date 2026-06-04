## ADDED Requirements

### Requirement: 动作事实 read/import tool 必须只接受真实上下文引用
系统 SHALL 确保 `readRecentExerciseRecommendationFact` 或等价动作事实 read/import tool 的模型可见合同只允许 Planner 使用当前 run 中真实可见的最近动作事实引用。模型可见 examples、schema description 和 whenToUse MUST NOT 暴露容易被照抄成真实引用的占位 factRef。

#### Scenario: 模型可见合同说明 factRef 来源
- **WHEN** 系统构造 `readRecentExerciseRecommendationFact` 的 tool manifest、schema 描述或 examples
- **THEN** 模型可见合同 MUST 说明 `factRef` 或 `messageId` 只能从当前 `run.metadata.recentExerciseRecommendationFacts` 中复制
- **AND** 模型可见合同 MUST NOT 包含 `cbf_previous_response` 或等价非真实上下文引用作为可执行 example
- **AND** examples SHOULD 使用明显代表 recent fact 摘要字段的示例值，并说明真实运行时必须替换为 metadata 中出现的值

#### Scenario: 当前 run 没有最近动作事实
- **WHEN** `run.metadata.recentExerciseRecommendationFacts` 为空
- **AND** 用户请求刷新、换一批、再推荐一批或表达新的自然语言约束
- **THEN** Planner MUST 仍负责决定使用 `final_answer`、`ask_user` 或其他当前可见合法 tool
- **AND** 服务端 MUST NOT 根据用户原文关键词选择 read/import tool、改写 Planner action 或伪造上一轮动作事实

### Requirement: 动作事实读取失败必须结构化归一
系统 SHALL 将动作事实 read/import tool 的读取失败归一为结构化 tool output，使失败可被 Planner 观察和恢复。正常不可访问、缺失、不唯一、状态不可读、schemaVersion 不兼容、payload 无效和 store 异常 MUST NOT 退化为 executor 的通用 `handler_error`。

#### Scenario: 引用不存在或不可访问
- **WHEN** Planner 调用 `readRecentExerciseRecommendationFact`
- **AND** `factRef` 或 `messageId` 不存在、跨用户、跨会话、不唯一、状态不可读、schemaVersion 不兼容或 payload 无效
- **THEN** tool MUST 返回 `ok: true` 的结构化失败输出，例如 `status = "failed"`
- **AND** `fulfillment.satisfied` MUST 为 `false`
- **AND** Runtime MUST NOT 登记可消费的动作事实 resource
- **AND** 失败或 diagnostic 结果 MUST NOT 支撑成功刷新回答

#### Scenario: fact store 抛出读取异常
- **WHEN** 动作事实 store 或数据库读取在 handler 内抛出异常
- **THEN** tool MUST 捕获该异常并返回稳定结构化失败 code
- **AND** Runtime trace MUST NOT 把该 tool result 记录为 `handler_error`
- **AND** repair 轮 MUST 能看到结构化失败 observation，而不是只看到通用 handler failure

### Requirement: 动作刷新 factRef 合同必须具备自动化验证
系统 SHALL 为动作刷新 factRef 合同提供自动化测试，覆盖模型可见合同、读取失败归一和生产聊天边界。

#### Scenario: 验证 manifest 不暴露占位引用
- **WHEN** production registry 序列化 tool manifest
- **THEN** 测试 MUST 断言 `readRecentExerciseRecommendationFact` manifest 不包含 `cbf_previous_response`
- **AND** 测试 MUST 断言 manifest 说明 `factRef/messageId` 的来源是当前 run metadata 中的真实 `recentExerciseRecommendationFacts`

#### Scenario: 验证读取异常不变成 handler_error
- **WHEN** `readExerciseRecommendationFact` 抛出异常
- **THEN** tool-level 测试 MUST 证明 `executeTool` 返回结构化失败 output
- **AND** 返回结果 MUST NOT 使用 `handler_error`

#### Scenario: 验证生产聊天不做服务端语义分流
- **WHEN** 用户发送“换一批”且当前 run 没有 recent fact
- **THEN** 测试 MUST 证明 `/api/chat` 不根据用户原文关键词选择 read/import tool
- **AND** 如果模型错误调用无效 factRef，系统 MUST 以结构化 tool result 和模型后续合法 terminal action 收口，而不是以 `duplicate_tool_failure` 直接报错
