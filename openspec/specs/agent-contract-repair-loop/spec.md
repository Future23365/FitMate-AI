# agent-contract-repair-loop Specification

## Purpose
TBD - created by archiving change harden-agent-contract-repair-loop. Update Purpose after archive.
## Requirements
### Requirement: Agent 决策合同失败必须生成结构化反馈
系统 SHALL 在 Agent 模型决策违反可恢复执行合同时生成结构化 `AgentDecisionFeedback`，并将该反馈作为下一轮模型可见的工具结果摘要，而不是只返回通用 `model_output_invalid`。

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

### Requirement: Agent 修复循环必须受预算和熔断约束
系统 SHALL 对 Agent 决策修复循环设置明确预算，并对重复不可重试失败执行确定性熔断。

#### Scenario: 可恢复错误进入下一轮
- **WHEN** runtime 生成 `AgentDecisionFeedback`
- **AND** 当前 run 仍有剩余 repair turn 和总 step 预算
- **THEN** 系统 MUST 将 feedback 写入当前 run 的 tool result 列表
- **AND** 下一轮模型请求 MUST 能看到该 feedback 的模型可见摘要
- **AND** 系统 MUST 继续保持已有 tool result 和 dependency graph 可验证

#### Scenario: 修复预算耗尽
- **WHEN** 同一 run 的 repair turn 数、同类 feedback 次数或总 step 数达到预算上限
- **THEN** 系统 MUST 停止继续模型修复
- **AND** 系统 MUST 返回标准 failed 结果
- **AND** trace MUST 记录耗尽的是哪一类预算

#### Scenario: 重复失败工具调用被熔断
- **WHEN** 模型重复调用相同 `toolName + normalizedInput`
- **AND** 该调用已经产生相同不可重试 failure code
- **THEN** runtime MUST 不再执行底层工具
- **AND** runtime MUST 返回结构化 `duplicate_tool_failure` feedback
- **AND** feedback MUST 引用首次失败的 tool result id 和重复次数

### Requirement: Agent 最终结果必须以服务端事实收口
系统 SHALL 只允许 `AgentExecutionResult` 的结构化事实字段来自当前 run 已登记的 tool result 或 runtime 可验证投影。

#### Scenario: 保存成功后模型漏填 generated 字段
- **WHEN** `saveConversationArtifactRevision` 或等价写工具已经成功返回唯一的 `revisionId`、`artifactId`、`validationId` 和 `policyDecisionId`
- **AND** 模型随后返回的 `final_result.generated` 缺少可由保存结果唯一确定的结构化字段
- **THEN** runtime MAY 从已登记保存结果投影合法 `AgentExecutionResult.generated`
- **AND** 投影结果 MUST 继续通过 final result 引用校验
- **AND** runtime MUST NOT 从用户自然语言或模型自由文本推断 artifact 事实

#### Scenario: completed operation 必须引用真实写工具结果
- **WHEN** 模型返回 `final_result.completed_operation`
- **THEN** `operationResultId` MUST 来自当前 run 已登记的非 artifact 写工具成功结果
- **AND** `policyDecisionId` 和 `confirmationId` 如存在，MUST 来自当前 run 已登记资源
- **AND** operation 的可见字段 MUST 来自写工具的安全摘要或 runtime 可验证投影
- **AND** 系统 MUST NOT 允许模型只凭自由文本声明用户资料、偏好或其他写操作成功

#### Scenario: 多个候选事实无法唯一投影
- **WHEN** 当前 run 中存在多个可能匹配的 draft、patch、save 或 operation 写结果
- **AND** 模型 final result 没有足够引用来唯一确定使用哪一个结果
- **THEN** runtime MUST NOT 猜测选择业务事实
- **AND** 系统 MUST 生成可恢复 feedback 或返回 failed 结果

#### Scenario: 模型声明成功但没有保存事实
- **WHEN** 模型返回 `generated` 或 `patched`
- **AND** 当前 run 没有可验证的写工具成功结果或合法 `revisionId`
- **THEN** 系统 MUST NOT 产生成功卡片
- **AND** 系统 MUST 生成可恢复 feedback 或返回 failed 结果

