## ADDED Requirements

### Requirement: 旧 artifact revision 读取必须恢复到 active revision
系统 SHALL 在受控 artifact payload 读取中支持将当前用户可访问的旧 revision id 恢复到同 lineage 的 active artifact，并继续执行 payload schema 校验。

#### Scenario: superseded artifact 恢复成功
- **WHEN** Agent 请求读取当前用户当前 session 下 `status = "superseded"` 的 artifact id
- **AND** 该 artifact 所属 lineage 存在同 `userId`、同 `sessionId`、同 `kind` 的 active descendant revision
- **THEN** 系统 MUST 读取 active descendant revision 的 payload
- **AND** 系统 MUST 返回 requested artifact id 与 active artifact id
- **AND** 系统 MUST 对 active payload 执行对应 artifact kind 的 Schema 校验

#### Scenario: active artifact 直接读取
- **WHEN** Agent 请求读取当前用户可访问且 `status = "active"` 的 artifact id
- **THEN** 系统 MUST 直接读取该 artifact payload
- **AND** 系统 MUST 返回 revision resolution 状态为 direct 或等价值

#### Scenario: 不跨越权限和 lineage
- **WHEN** Agent 请求读取的 artifact 不属于当前 `userId`
- **OR** 该 artifact 属于不同 `sessionId`、不同 `kind` 或不存在 active descendant revision
- **THEN** 系统 MUST 返回结构化读取失败
- **AND** 系统 MUST NOT 返回其他用户、其他会话或其他 kind 的 payload
