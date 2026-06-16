## ADDED Requirements

### Requirement: Shadow runner must align runtime metadata validation with production wrapper

系统 SHALL 在 Shadow Probe decision 预校验和 dev-safe tool 执行中复用生产 LangChain tool wrapper 的 runtime metadata envelope 边界。`runtimeMetadata` MUST 被视为 request-local runtime metadata，而不是业务 input 字段。

#### Scenario: Decision with runtimeMetadata passes business schema validation
- **WHEN** Shadow runner 读取一个 `call_tool` decision，且 `toolInput` 同时包含合法业务字段和 provider-visible `runtimeMetadata`
- **THEN** runner MUST 在业务 schema 校验前剥离 `runtimeMetadata`
- **AND** runner MUST 使用剥离后的业务 input 校验对应 tool 的业务 `inputSchema`
- **AND** runner MUST NOT 因 `runtimeMetadata` 存在而返回 `decision_validation_failed`

#### Scenario: Handler receives business input only
- **WHEN** Shadow runner 执行通过校验的 dev-safe tool
- **THEN** runner MUST 调用生产 `executeLangChainToolWrapper` 或等价 wrapper 执行边界
- **AND** tool handler MUST 只收到业务 input 字段
- **AND** tool handler MUST NOT 收到 `runtimeMetadata`

#### Scenario: Unknown business fields remain rejected
- **WHEN** Shadow runner 读取一个 `call_tool` decision，且 `toolInput` 包含不属于 `runtimeMetadata` 的未知业务字段
- **THEN** runner MUST 按该 tool 的业务 `inputSchema` 拒绝 decision
- **AND** runner MUST 记录 `decision_validation_failed` 或等价 schema validation failure
- **AND** runner MUST NOT 把未知业务字段当作 runtime metadata 忽略
