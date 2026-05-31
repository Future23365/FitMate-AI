## ADDED Requirements

### Requirement: Trace 必须记录 stale artifact revision 解析
系统 SHALL 在受控 artifact payload 读取发生 revision 解析时，记录足够诊断 stale artifact id 的 trace 信息。

#### Scenario: 旧 artifactId 被解析到 active revision
- **WHEN** 受控工具读取 artifact payload 时将原始 artifactId 解析到不同的 active artifactId
- **THEN** trace 的 `tool_call` step MUST 记录原始 artifactId
- **AND** trace 的 `tool_call` step MUST 记录最终读取的 active artifactId
- **AND** trace MUST NOT 记录未授权 artifact payload

#### Scenario: revision 解析失败
- **WHEN** 受控工具无法将原始 artifactId 解析到可访问 active artifact
- **THEN** trace 的 `tool_call` step MUST 记录失败 code 和可诊断原因
- **AND** 用户可见回复 MUST 继续使用可恢复失败引导
