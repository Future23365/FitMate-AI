## MODIFIED Requirements

### Requirement: Planner 和 tool budget 必须限制运行成本
系统 SHALL 在 Runtime 中执行 planner call、tool call、repair、token 或等价成本预算。预算耗尽后 Runtime MUST 结构化失败收口，并不得继续调用模型或 tool handler。Production `/api/chat` 的低风险 LangChain Agent 链路 MUST 支持多 tool 调用，不得将所有业务 tool 共享预算固定为过小值导致单个 tool 独占整轮预算。`runtimeMetadata.activitySummary` MUST 只作为业务 tool invocation 的 request-local UI metadata，不得恢复独立 activity report 预算。

#### Scenario: Production 文本聊天允许低风险多 tool 链路
- **WHEN** production `/api/chat` 构造 Agent run limits
- **THEN** 整轮业务 tool 总预算 MUST 设置为 20
- **AND** 单个业务 tool 单轮调用上限 MUST 设置为 2
- **AND** 模型调用预算和 LangChain graph step 上限 MUST 与 20 次业务 tool 调用、runtime metadata 投影和最终结构化回答的最坏路径匹配，不能低于完成该链路所需的模型调用 / graph step 上限
- **AND** runtime metadata 投影 MUST NOT 被计算为独立 provider tool call、ToolMessage、activity report 或 graph step
- **AND** 该预算放宽 MUST 只改变运行预算，不得绕过 LangChain tool wrapper、服务端 Zod 校验、Policy Guard、Resource Contract Validator、visible output validator、trace 或 production response adapter

#### Scenario: 旧 activity report 预算不作为生产成本边界
- **WHEN** production runtime、prompt 或 trace 描述当前 Agent run budget
- **THEN** 系统 MUST NOT 把 `reportAgentActivity` 或 `maxActivityReports` 描述为当前生产 activity 摘要的成本控制合同
- **AND** 成本边界 MUST 使用模型调用预算、业务 tool 总预算、单 tool 连续调用上限、graph step 限制、timeout、token budget 和 runtime metadata projection 边界表达
- **AND** runtime metadata projection 边界 MUST NOT 允许模型通过 activity-only tool 进入空转 loop
