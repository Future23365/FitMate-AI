## MODIFIED Requirements

### Requirement: Planner 和 tool budget 必须限制运行成本
系统 SHALL 在 Runtime 中执行 planner call、tool call、repair、token 或等价成本预算。预算耗尽后 Runtime MUST 结构化失败收口，并不得继续调用模型或 tool handler。Production `/api/chat` 的低风险只读 Agent 链路 MUST 支持多 tool 调用，不得将总 tool 调用预算固定为 1。

#### Scenario: Production 文本聊天允许低风险多 tool 链路
- **WHEN** production `/api/chat` 构造 Agent run limits
- **THEN** `maxToolCalls` MUST 设置为 10
- **AND** `maxPlannerCalls` 和 `maxSteps` MUST 与 10 次 tool 调用加一次 terminal action 的最坏路径匹配，不能低于完成该链路所需的 planner / step 上限
- **AND** 该预算放宽 MUST 只改变总运行预算，不得绕过 Action Validator、Policy Guard、Resource Contract Validator、ResourceStore 或 Response Renderer

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
