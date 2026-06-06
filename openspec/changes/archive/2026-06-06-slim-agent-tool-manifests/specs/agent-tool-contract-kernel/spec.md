## MODIFIED Requirements

### Requirement: ToolRegistry 必须生成安全 manifest

系统 SHALL 通过 `ToolRegistry` 注册 tool、查询 tool、列出当前上下文可用 tool，并将可用 tool 序列化为 Planner 可见的 `ToolManifest[]`。

#### Scenario: 生成 Planner manifest
- **WHEN** Runtime 为 Planner 准备可用工具列表
- **THEN** `ToolRegistry` MUST 生成 `ToolManifest[]`
- **AND** manifest MUST 包含 tool name、version、description、whenToUse、whenNotToUse、inputJsonSchema、outputJsonSchema、安全 policy hint 和安全 examples
- **AND** manifest examples MUST 使用完整 `AgentAction` tool_call 形态，例如 `{ "type": "tool_call", "toolName": "<tool name>", "input": { ... } }`
- **AND** manifest examples MUST NOT 只暴露裸 tool input 片段
- **AND** manifest MUST NOT 包含 handler、数据库对象、secret、完整用户 payload 或服务端 capability 对象

#### Scenario: Manifest examples 保持安全和可执行
- **WHEN** tool 声明 examples
- **THEN** 每个 example MUST 包含中文 `description`
- **AND** 每个 example 的 `action.type` MUST 为 `tool_call`
- **AND** 每个 example 的 `action.toolName` MUST 等于该 tool 的真实 `name`
- **AND** 每个 example 的 `action.input` MUST 匹配该 tool 的 `inputSchema`
- **AND** manifest hardening MUST 继续拒绝 prompt-injection-like examples 或暴露 sensitive fields 的 examples
