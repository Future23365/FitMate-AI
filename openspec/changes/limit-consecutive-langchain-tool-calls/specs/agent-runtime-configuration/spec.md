## MODIFIED Requirements

### Requirement: 业务 tool 预算必须区分全局总量和单 tool 上限
系统 SHALL 将生产 LangChain Agent 的业务 tool 预算拆分为整轮总调用上限和单个业务 tool 连续调用上限。整轮总调用上限 MUST 默认为 20；单个业务 tool 连续调用上限 MUST 默认为 2。

#### Scenario: 全局业务 tool 安全上限为 20
- **WHEN** Runtime 执行生产业务 tool call
- **THEN** 系统 MUST 使用集中配置的 `maxToolCalls = 20` 作为整轮业务 tool 安全熔断上限
- **AND** 超过该上限时 Runtime MUST NOT 执行后续业务 tool handler
- **AND** 超限结果 MUST 归一为 `budget_exhausted` 或等价预算失败

#### Scenario: 单个业务 tool 有独立连续调用上限
- **WHEN** 同一轮 Agent run 中模型连续调用同一个业务 tool
- **THEN** 系统 MUST 使用集中配置的 `maxToolCallsPerTool = 2` 或等价字段限制该业务 tool 的连续调用次数
- **AND** 达到连续上限后，后续 provider model request MUST NOT 继续暴露该业务 tool，直到另一个业务 tool 打断该连续序列
- **AND** 同一 provider response 内超过连续上限的调用 MUST 被阻止执行 handler
- **AND** 其他业务 tool 的调用机会 MUST NOT 因该 tool 达到自身连续上限而被直接耗尽

#### Scenario: activity tool 不计入也不打断业务 tool 连续限制
- **WHEN** 模型调用 `reportAgentActivity`
- **THEN** 该调用 MUST 继续由 `maxActivityReports` 控制
- **AND** 该调用 MUST NOT 消耗业务 tool 总预算或业务 tool 连续调用上限
- **AND** 该调用 MUST NOT 打断最近业务 tool 的连续调用序列
