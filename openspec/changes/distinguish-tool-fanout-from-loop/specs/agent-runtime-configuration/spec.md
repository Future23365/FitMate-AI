## MODIFIED Requirements

### Requirement: 业务 tool 预算必须区分全局总量和单 tool 上限
系统 SHALL 将生产 LangChain Agent 的业务 tool 预算拆分为整轮总调用上限和单个业务 tool 连续模型决策批次上限。整轮总调用上限 MUST 默认为 20；单个业务 tool 连续模型决策批次上限 MUST 默认为 2。业务 tool call 的 `runtimeMetadata` MUST 只作为当前 tool invocation 的 request-local UI metadata，不得被建模为独立 activity tool、独立预算或业务 tool 连续序列打断点。同一 provider model response 中同名业务 tool 的多个不同输入请求 MUST 继续受整轮总调用上限约束，但 MUST NOT 被配置语义解释为多个连续模型决策批次。

#### Scenario: runtime metadata 不作为 activity tool 预算
- **WHEN** 模型调用业务 tool 并携带 `runtimeMetadata.activitySummary`
- **THEN** 该 metadata MUST NOT 由 `maxActivityReports` 或等价独立 activity report 预算控制
- **AND** 该 metadata MUST NOT 消耗业务 tool 总预算、业务 tool 连续调用上限、模型调用预算或 graph step
- **AND** runtime metadata 投影失败、缺失或被丢弃 MUST NOT 改变业务 tool handler 是否执行
- **AND** Runtime MUST 继续按真实业务 tool call 统计整轮总预算，并按 provider model response 批次统计单 tool 连续调用上限

#### Scenario: 同批 fan-out 不改变配置默认值
- **WHEN** 同一 provider model response 返回同一业务 tool 的多个不同输入请求
- **THEN** `maxToolCallsPerTool` MUST NOT 被解释为该批次内同名 tool execution 数量上限
- **AND** 每个业务 tool execution MUST 继续消耗 `maxToolCalls` 整轮总预算
- **AND** 配置层 MUST NOT 为具体业务 tool、具体用户短句或具体字段组合提供单独预算分支
