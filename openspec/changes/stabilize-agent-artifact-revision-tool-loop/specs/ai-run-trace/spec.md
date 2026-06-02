## ADDED Requirements

### Requirement: Trace 必须记录 Agent artifact revision 恢复
系统 SHALL 在 Agent 工具读取 artifact payload 或基于 artifact 生成 routine 时记录 requested/active artifact revision 关系。

#### Scenario: Agent 工具恢复 artifact revision
- **WHEN** Agent 工具将 requested artifact id 恢复到不同的 active artifact id
- **THEN** trace MUST 记录 requested artifact id
- **AND** trace MUST 记录 active artifact id
- **AND** trace MUST 记录 revision resolution 状态
- **AND** trace MUST NOT 记录未授权 payload

### Requirement: Trace 必须记录重复工具失败熔断
系统 SHALL 在 Agent runtime 熔断重复不可重试工具失败时记录可诊断证据。

#### Scenario: 重复工具失败被熔断
- **WHEN** runtime 因相同工具和相同归一化输入已有不可重试失败而阻止再次执行工具
- **THEN** trace MUST 记录 duplicate failure code
- **AND** trace MUST 记录原始失败 tool result id
- **AND** trace MUST 记录重复次数或等价计数
- **AND** trace MUST 能区分真实底层工具执行失败和 runtime 熔断
