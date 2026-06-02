## ADDED Requirements

### Requirement: Agent 读工具必须暴露 artifact revision 恢复摘要
系统 SHALL 让统一 `AgentToolRegistry` 中的 artifact payload 读工具返回模型可引用的 payload 结果 id，并在发生 revision 恢复时返回稳定摘要。

#### Scenario: getArtifactPayload 恢复旧 revision
- **WHEN** Agent 通过 `getArtifactPayload` 读取 superseded artifact id
- **AND** 服务端恢复到同 lineage 的 active artifact
- **THEN** 工具结果 MUST 包含 `artifactPayloadId`
- **AND** 工具结果摘要 MUST 包含 requested artifact id、active artifact id 和 revision resolution 状态
- **AND** 模型后续步骤 MUST 能基于该结果继续引用真实 payload，而不是从 recent summary 重建 payload

### Requirement: Agent runtime 必须熔断重复不可重试工具失败
系统 SHALL 在单次 Agent run 内识别同一工具、同一归一化输入、同一不可重试失败码的重复调用，并阻止底层工具被反复执行。

#### Scenario: 重复读取同一个不可访问 artifact
- **WHEN** Agent 已经使用相同输入调用 `getArtifactPayload` 并得到 `not_found`、`forbidden` 或等价不可重试失败
- **AND** 模型后续再次请求相同工具和相同归一化输入
- **THEN** runtime MUST 返回结构化 duplicate failure 或等价熔断结果
- **AND** runtime MUST 引用首次失败的 tool result id
- **AND** runtime MUST NOT 再次执行底层 artifact 读取

#### Scenario: 修复后的不同输入仍可执行
- **WHEN** Agent 上一次工具失败后，模型后续请求同一工具但输入已经改变
- **THEN** runtime MUST 允许执行该工具
- **AND** runtime MUST NOT 因工具名相同而熔断不同输入
