## MODIFIED Requirements

### Requirement: Business tool calls must support runtime metadata envelope
系统 SHALL 为所有生产业务 LangChain tool 统一支持 request-local runtime metadata envelope。该 envelope MUST 只承载运行期 UI / trace metadata，不得成为业务 input、业务 output、模型可见 tool result、resource、grounding 或持久化事实。生产 wrapper 的业务输入剥离边界 MUST 可被 Shadow runner 等 dev-only 执行入口复用，避免 provider-visible schema 与业务 schema 校验漂移。

#### Scenario: Provider-visible input includes runtimeMetadata
- **WHEN** production tool catalog 序列化任意 `executionKind = "business"` 的 LangChain tool
- **THEN** provider-visible input schema MUST 包含可选 `runtimeMetadata`
- **AND** `runtimeMetadata` MUST 至少允许可选 `activitySummary`
- **AND** `runtimeMetadata` 的模型可见说明 MUST 使用中文解释其 request-local UI metadata 语义
- **AND** `runtimeMetadata` MUST NOT 要求模型提供 `toolName`、trace id、数据库 id、resource id、message id 或服务端内部字段

#### Scenario: Handler receives only business input
- **WHEN** 模型调用业务 tool 并在 arguments 中提供 `runtimeMetadata`
- **THEN** 通用 wrapper MUST 在业务 schema 校验和 handler 执行前剥离 `runtimeMetadata`
- **AND** handler MUST 只收到该 tool 原本的业务 input 字段
- **AND** handler MUST NOT 根据 `activitySummary` 改变查询、校验、保存、权限或业务输出行为

#### Scenario: Runtime metadata does not change business schema boundary
- **WHEN** 业务 input 字段不满足原业务 `inputSchema`
- **THEN** wrapper MUST 继续按原业务 schema 返回 `tool_schema_invalid` 或等价结构化失败
- **AND** `runtimeMetadata` 的存在 MUST NOT 让非法业务字段通过校验
- **AND** `runtimeMetadata` 的缺失 MUST NOT 让合法业务 tool call 失败

#### Scenario: Dev-only runner reuses business input boundary
- **WHEN** dev-only runner 或诊断工具需要在执行前校验业务 tool input
- **THEN** 该入口 MUST 复用生产 wrapper 的业务输入剥离边界
- **AND** 该入口 MUST NOT 直接把包含 `runtimeMetadata` 的完整 provider-visible input 交给业务 `inputSchema` 校验
- **AND** 该入口 MUST NOT 复制一套会与生产 wrapper 漂移的 runtime metadata 解析规则
