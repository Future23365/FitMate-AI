## ADDED Requirements

### Requirement: Routine Agent 工具链必须通过服务端资源解析 draft

聊天 routine 编排链路 SHALL 将 `generateRoutineDraft` 产出的完整 draft 作为本轮 Agent runtime 的服务端资源保存，并允许后续 validation、policy 和 artifact revision 工具通过资源 id 读取该 draft。模型 SHALL 只负责引用服务端登记的资源 id，不得被要求复写完整 routine draft payload。

#### Scenario: Draft 生成后进入校验
- **WHEN** `generateRoutineDraft` 成功返回 `draftId` 和完整 routine draft
- **AND** 模型随后调用 `validateRoutineDraft` 并提供同一 `draftId`
- **THEN** 服务端 MUST 从本轮 Agent tool results 中解析完整 draft
- **AND** 服务端 MUST 使用解析出的 draft 执行 routine 校验
- **AND** 系统 MUST NOT 要求模型在 `validateRoutineDraft` 输入中提交完整 `draft` 对象

#### Scenario: 模型误传局部 draft payload
- **WHEN** `generateRoutineDraft` 成功返回 `draftId` 和完整 routine draft
- **AND** 模型调用 `validateRoutineDraft` 时提供同一 `draftId`
- **AND** 模型额外提交了不完整或字段形状不匹配的 `draft` 对象
- **THEN** 服务端 MUST NOT 使用该模型提交的 `draft` 作为校验事实源
- **AND** 服务端 MUST 继续从本轮 Agent tool results 中解析完整 draft
- **AND** 系统 MUST NOT 因模型误传的 partial `draft` 字段返回 `schema_validation_failed`

#### Scenario: Draft 资源不存在
- **WHEN** 模型调用 `validateRoutineDraft`、`evaluatePolicy` 或 `saveConversationArtifactRevision` 时引用不存在的 `draftId`
- **THEN** 服务端 MUST 返回结构化工具失败
- **AND** 系统 MUST NOT 展示或保存 routine 卡片
- **AND** AI Trace MUST 记录资源解析失败的工具名和资源 id

#### Scenario: 候选集合不匹配
- **WHEN** 模型调用 `validateRoutineDraft` 时提供的 `candidateSetId` 与 draft 生成时登记的候选集合不一致
- **THEN** 服务端 MUST 返回结构化依赖失败
- **AND** 系统 MUST NOT 用不匹配的候选集合继续校验或保存 routine

#### Scenario: 校验和策略通过后写入 artifact
- **WHEN** routine draft 已通过 `validateRoutineDraft`
- **AND** Policy 允许展示或进入可确认展示边界
- **AND** 模型调用 `saveConversationArtifactRevision` 引用对应 `draftId`、`validationId` 和 `policyDecisionId`
- **THEN** 服务端 MUST 使用已登记的 draft payload 写入 `ConversationArtifact`
- **AND** 聊天回复 MUST 包含可供前端渲染 routine 卡片的 artifact / revision 证据
- **AND** 系统 MUST NOT 退化为仅返回自由文本编排
