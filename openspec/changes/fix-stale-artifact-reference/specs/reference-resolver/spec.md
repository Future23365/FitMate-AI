## ADDED Requirements

### Requirement: resolved artifact 必须能解析到当前 active revision
系统 SHALL 在后续服务端流程消费 `ReferenceResolution` 时，将当前用户可访问的旧 revision artifactId 解析到同一 lineage 的当前 active artifact。

#### Scenario: 旧 revision 被自动保存替换
- **WHEN** `ReferenceResolution` 指向的 artifact 属于当前用户且状态为 `superseded`
- **AND** 同一用户、同一会话、同一 kind 下存在可追溯到该 artifact 的 active revision
- **THEN** 受控 artifact payload 读取 MUST 使用当前 active revision
- **AND** 结果 MUST 保留原始 artifactId 与最终 active artifactId 的诊断信息

#### Scenario: 旧 revision 无法追溯到 active artifact
- **WHEN** `ReferenceResolution` 指向的 artifact 不存在、属于其他用户、已归档，或无法追溯到同一 lineage 的 active revision
- **THEN** 受控 artifact payload 读取 MUST 返回失败结果
- **AND** 系统 MUST NOT 使用 conversationSummary、recent artifact 摘要或候选摘要重建完整 payload

#### Scenario: active artifact 直接读取
- **WHEN** `ReferenceResolution` 指向的 artifact 属于当前用户且状态为 `active`
- **THEN** 受控 artifact payload 读取 MUST 直接校验并返回该 artifact payload
- **AND** 系统 MUST NOT 额外切换到其他同类 artifact
