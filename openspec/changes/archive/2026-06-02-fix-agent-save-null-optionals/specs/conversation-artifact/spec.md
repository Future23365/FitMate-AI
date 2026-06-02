## ADDED Requirements

### Requirement: Agent artifact 保存工具必须接受可选字段 null absence
Agent 保存 `ConversationArtifact` 或 artifact revision 时，系统 SHALL 区分可选字段的 `null` absence 与真正缺失必需资源。对于保存工具中表示“不适用”的可选字段，`null` MUST 被解析为未提供；必填字段、依赖资源和权限边界 MUST 继续由服务端校验。

#### Scenario: 首次保存 routine 时可选字段为 null
- **WHEN** Agent 已经生成 routine draft
- **AND** draft 已通过 validation
- **AND** policy 允许保存新 artifact
- **AND** `saveConversationArtifactRevision` 输入包含 `sourceArtifactId: null`、`payload: null`、`patchId: null` 或 `responseMessageId: null`
- **THEN** 系统 MUST 将这些可选字段视为未提供
- **AND** 系统 MUST 使用 `draftId` 解析服务端已登记 draft payload
- **AND** 系统 MUST NOT 因这些可选字段为 `null` 返回 Schema 校验失败

#### Scenario: 缺少 draft 或 payload 仍失败
- **WHEN** `saveConversationArtifactRevision` 输入没有 `draftId`
- **AND** 输入没有有效 `payload`
- **THEN** 系统 MUST 拒绝保存
- **AND** 系统 MUST NOT 因 `payload: null` 绕过 payload 或 draft 依赖校验

#### Scenario: 首次创建缺少 artifactKind 仍失败
- **WHEN** `saveConversationArtifactRevision` 输入没有 `sourceArtifactId`
- **AND** 输入没有有效 `artifactKind`
- **THEN** 系统 MUST 拒绝保存
- **AND** 系统 MUST NOT 因 `artifactKind: null` 绕过首次创建 artifact 的类型校验
