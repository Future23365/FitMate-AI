## ADDED Requirements

### Requirement: Trace 必须记录 AgentAction normalization 诊断
系统 SHALL 在 AgentAction 顶层字段被 type-aware normalization 丢弃时记录可复盘 trace 诊断。诊断 MUST 说明 selected action type、被丢弃字段路径和 normalized action 是否继续执行；诊断 MUST NOT 记录被丢弃字段的完整值、未经脱敏的大 payload、secret、跨用户事实或用户不可见内部 payload。

#### Scenario: tool_call 顶层 content 被丢弃
- **WHEN** Planner 返回 `type = "tool_call"` 的 action
- **AND** action 顶层包含不属于 `tool_call` allowlist 的 `content`
- **AND** Runtime 丢弃该字段并继续执行 normalized action
- **THEN** trace MUST 记录 action normalization 诊断
- **AND** 诊断 MUST 包含 selected action type `tool_call`
- **AND** 诊断 MUST 包含 dropped field path `content`
- **AND** 诊断 MUST 记录 normalized action 继续进入 validation / executor
- **AND** 诊断 MUST NOT 记录 `content` 的完整文本

#### Scenario: 多个顶层字段被丢弃
- **WHEN** Runtime 对一个合法 discriminator 的 AgentAction 丢弃多个不参与 selected variant 执行语义的顶层字段
- **THEN** trace MUST 记录所有被丢弃字段的 path
- **AND** trace MAY 记录字段类型、长度、hash 或脱敏摘要
- **AND** trace MUST NOT 将被丢弃字段标记为 tool input、terminal content、visible output、resource 或 usedRefs

#### Scenario: normalization 不掩盖真正 schema 失败
- **WHEN** Runtime 无法通过 normalization 得到可执行 AgentAction
- **THEN** trace MUST 继续记录 invalid action 或 schema validation failure
- **AND** trace MUST 能区分 normalized-and-executed、normalized-then-failed 和 not-normalizable 三类边界
