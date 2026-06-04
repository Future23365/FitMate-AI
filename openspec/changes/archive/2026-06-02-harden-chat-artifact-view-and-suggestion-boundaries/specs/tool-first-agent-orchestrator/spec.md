## ADDED Requirements

### Requirement: Agent 不得用服务端自然语言规则改写非写入对话语义

系统 SHALL 由 LLM 结合 `ContextPackage`、recent messages、recent artifacts 和 tool results 通过结构化 Agent decision 判断本轮是普通回答、澄清、artifact 查看、训练生成、训练修改还是写入请求。服务端 MAY 校验工具调用、资源引用、产品能力和 final result 合同，但 MUST NOT 使用关键词、正则、短句模板、同义词表或评分规则判断用户自然语言是否属于确认、否定、取消、闲聊、查看或保存。

#### Scenario: 模型将短回复处理为普通回答
- **WHEN** LLM 基于上下文返回 `final_result.answered` 或等价普通回答结果
- **THEN** 系统 MUST 按该结构化结果投影用户可见回复
- **AND** 系统 MUST NOT 因用户原文是短回复而额外调用 `searchExercises`、`generateRoutineDraft`、`evaluatePolicy` 或 `saveConversationArtifactRevision`
- **AND** 系统 MUST NOT 用服务端短语规则把该结果改写成生成、修改、保存或取消意图

#### Scenario: 模型请求执行工具
- **WHEN** LLM 请求调用训练生成、训练修改、artifact 读取或写入工具
- **THEN** 服务端 MUST 只校验该工具输入是否满足 Schema、当前 run 资源依赖、权限、Policy、Validator 和产品能力边界
- **AND** 服务端 MUST NOT 因用户原文看起来像或不像某类意图而替模型改选另一个 toolName 或 final result status

#### Scenario: 模型输出缺少执行证据
- **WHEN** LLM 返回生成、修改或写入成功结果
- **AND** 当前 run 没有对应已登记 tool result、validationId、policyDecisionId、revisionId 或 operationResultId
- **THEN** 系统 MUST 拒绝该成功投影并进入既有 repair、clarification、blocked 或 failed 路径
- **AND** 系统 MUST NOT 通过读取用户原文补造缺失资源

### Requirement: Agent artifact 查看必须是只读工具链

系统 SHALL 支持 LLM 使用只读 artifact 工具回答查看类请求，并在读取到可展示 payload 后以 `answered` 结束本轮。artifact 查看 MUST NOT 被当成重新生成、验证、Policy 或保存流程。

#### Scenario: 查看最近 routine artifact
- **WHEN** 用户请求查看最近生成或刚才生成的训练
- **AND** LLM 通过 `listRecentArtifacts`、`resolveArtifactReference`、`searchArtifacts` 或 `getArtifactPayload` 读取到当前用户可访问的 routine payload
- **AND** LLM 返回引用该读取结果的 `final_result.answered`
- **THEN** 系统 MUST 允许该结果作为只读查看回复
- **AND** 系统 MUST NOT 要求该路径存在 `draftId`、`validationId`、`policyDecisionId` 或 `revisionId`
- **AND** 系统 MUST NOT 调用 `saveConversationArtifactRevision`

#### Scenario: 查看目标不明确
- **WHEN** LLM 通过 artifact 工具发现有多个可访问候选且无法唯一确定目标
- **THEN** 系统 MUST 允许 LLM 返回 `needs_clarification`
- **AND** 澄清建议 MUST 只帮助用户选择查看或调整目标
- **AND** 系统 MUST NOT 替模型按标题、摘要或用户原文猜测 artifactId

### Requirement: 写工具 message 绑定必须来自服务端执行上下文

系统 SHALL 将当前 assistant response message id 作为 Agent runtime 执行上下文的一部分传给 artifact 写工具。LLM MUST NOT 成为 artifact 与聊天气泡绑定关系的事实来源。

#### Scenario: Agent 保存新 artifact
- **WHEN** `saveConversationArtifactRevision` 在本轮 Agent run 中创建新的 routine 或 plan artifact
- **THEN** 写工具 MUST 使用服务端 `AgentToolExecutionContext.responseMessageId` 或等价 context 字段作为 artifact `messageId`
- **AND** 系统 MUST NOT 依赖 LLM 输入中的 `responseMessageId` 决定 artifact 绑定的 assistant message

#### Scenario: 模型提供 responseMessageId
- **WHEN** LLM 在写工具输入中提供 `responseMessageId`
- **THEN** 系统 MAY 记录该值用于 trace 诊断
- **AND** 系统 MUST 使用服务端执行上下文中的当前 response message id 作为持久化事实
- **AND** 系统 MUST NOT 让模型值覆盖服务端 message 绑定
