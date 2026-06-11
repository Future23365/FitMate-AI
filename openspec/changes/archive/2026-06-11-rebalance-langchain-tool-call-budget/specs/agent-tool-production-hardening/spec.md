## MODIFIED Requirements

### Requirement: Planner 和 tool budget 必须限制运行成本
系统 SHALL 在 Runtime 中执行 planner call、tool call、repair、token 或等价成本预算。预算耗尽后 Runtime MUST 结构化失败收口，并不得继续调用模型或 tool handler。Production `/api/chat` 的低风险 LangChain Agent 链路 MUST 支持多 tool 调用，不得将所有业务 tool 共享预算固定为过小值导致单个 tool 独占整轮预算。

#### Scenario: Production 文本聊天允许低风险多 tool 链路
- **WHEN** production `/api/chat` 构造 Agent run limits
- **THEN** 整轮业务 tool 总预算 MUST 设置为 20
- **AND** 单个业务 tool 单轮调用上限 MUST 设置为 2
- **AND** 模型调用预算和 LangChain graph step 上限 MUST 与 20 次业务 tool 调用、activity report 和最终结构化回答的最坏路径匹配，不能低于完成该链路所需的模型调用 / graph step 上限
- **AND** 该预算放宽 MUST 只改变运行预算，不得绕过 LangChain tool wrapper、服务端 Zod 校验、Policy Guard、Resource Contract Validator、visible output validator、trace 或 production response adapter

#### Scenario: Planner call 预算耗尽
- **WHEN** `LlmPlanner` 调用次数达到 run 配置的 planner budget
- **THEN** Runtime MUST 停止继续调用模型
- **AND** Runtime MUST 返回稳定 budget 类错误或 ask_user / failed 类安全收口

#### Scenario: Tool call 预算耗尽
- **WHEN** tool call 次数达到 run 配置的 tool budget
- **THEN** Runtime MUST NOT 调用后续 tool handler
- **AND** trace / replay 摘要 MUST 记录预算耗尽原因

#### Scenario: 重复 tool 调用不能被预算放宽掩盖
- **WHEN** Planner 在同一 run 中重复请求相同 toolName、相同 toolVersion 和相同归一化 input
- **THEN** trace / replay MUST 能记录重复调用摘要
- **AND** 系统 SHOULD 在结构化 observation、duplicate failure 或等价安全边界中提示 Planner 收口或调整输入
- **AND** 系统 MUST NOT 通过提高 tool 预算把重复空转伪装成成功刷新
