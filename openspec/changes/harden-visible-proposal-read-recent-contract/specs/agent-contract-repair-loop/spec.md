## MODIFIED Requirements

### Requirement: Agent 决策合同失败必须生成结构化反馈
系统 SHALL 在 Agent 模型决策违反可恢复执行合同时生成结构化 `AgentDecisionFeedback` 或等价模型可见 repair feedback，并将该反馈作为下一轮模型可见的工具结果摘要或 invalid action observation，而不是只返回通用 `model_output_invalid` 或泛化 schema 失败消息。

#### Scenario: final result 引用未登记 revision
- **WHEN** 模型返回 `final_result.generated` 或 `final_result.patched`
- **AND** 结果引用的 `revisionId` 在当前 run 的 dependency graph 中没有任何已登记 producer
- **AND** 当前 run 已具备继续保存所需的 `draftId`、`validationId` 和 `policyDecisionId`
- **THEN** 系统 MUST 拒绝该 `revisionId`
- **AND** 系统 MUST 生成 `AgentDecisionFeedback`
- **AND** feedback MUST 标记缺失资源为 `revisionId`
- **AND** feedback MUST 推荐调用 `saveConversationArtifactRevision` 或等价写工具
- **AND** 系统 MUST NOT 将该 final result 投影为成功训练卡片

#### Scenario: 工具输入缺少可恢复资源引用
- **WHEN** 模型调用工具时缺少该工具输入 schema 或 dependency graph 要求的已登记资源 id
- **AND** 当前 run 中存在可用于补齐下一步的上游资源
- **AND** runtime 能根据当前已登记资源确定推荐下一步
- **THEN** 系统 MUST 生成结构化 feedback
- **AND** feedback MUST 包含缺失依赖、可用资源和推荐下一步工具
- **AND** 系统 MUST 允许模型在剩余预算内重新决策

#### Scenario: tool input schema 失败必须暴露安全字段级 repair feedback
- **WHEN** 模型返回已注册且当前 manifest 可见的 `tool_call`
- **AND** tool input 未通过对应 tool `inputSchema` 校验
- **AND** 失败原因可通过安全字段路径和中文说明表达
- **THEN** 系统 MUST 返回 `invalid_tool_input`
- **AND** 模型可见 feedback MUST 包含脱敏后的字段路径、失败原因和可恢复建议
- **AND** feedback MUST NOT 包含 handler payload、数据库完整输出、secret、stack trace 或用户不可见事实
- **AND** 系统 MUST NOT 在服务端替模型补全 tool input 或改写高层 action

#### Scenario: 可恢复性必须由 ToolResult 和 runtime 共同判定
- **WHEN** 模型决策或工具结果出现 `schema_validation_failed`、`invalid_dependency` 或 `model_output_invalid`
- **THEN** 系统 MUST 同时检查 runtime 错误分类、tool result 状态、已登记资源、hard boundary 状态和修复预算
- **AND** 系统 MUST NOT 仅凭 `AgentToolError.retryable`、错误码名称或 prompt 文案判定该错误可恢复
- **AND** 如果缺少任一可恢复条件，系统 MUST 返回 blocked 或 failed，而不是继续调用模型猜测

#### Scenario: ToolResult 失败进入反馈上下文
- **WHEN** tool 返回结构化失败、`satisfied=false` 或 result requirement 未满足诊断
- **THEN** runtime MUST 只将该结果作为失败事实和模型可见摘要登记
- **AND** runtime MUST NOT 把该结果登记为可被后续工具消费的成功资源
- **AND** runtime MUST NOT 从用户原文、query、title、summary 或 `conversationSummary` 推断额外修复参数

#### Scenario: prompt 引导不能替代 runtime 合同校验
- **WHEN** prompt 指示模型基于 `AgentDecisionFeedback` 修复上一轮决策
- **THEN** runtime MUST 仍然校验下一轮模型输出的 Schema、资源 producer、用户隔离、Policy、预算和 final result 引用
- **AND** runtime MUST NOT 因 prompt 已写明规则而跳过任何确定性合同校验
- **AND** prompt MUST NOT 被视为 artifact、revision、policy、validation、operation 或用户权限事实来源

#### Scenario: 不可恢复边界失败
- **WHEN** 工具失败原因属于权限拒绝、跨用户数据、Policy 拒绝、不可访问资源或不可重试 hard boundary
- **THEN** 系统 MUST NOT 要求模型继续猜测修复
- **AND** 系统 MUST 以 blocked 或 failed 的标准 Agent 结果终止
- **AND** trace MUST 记录该失败不是可恢复 feedback
