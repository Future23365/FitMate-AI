## MODIFIED Requirements

### Requirement: Trace 展示 AI 阶段 token 分账
`/dev/ai-traces` SHALL 按 AI 阶段展示 token usage、耗时、执行状态和跳过原因，使开发者能判断每轮 token 消耗来自哪个阶段。

#### Scenario: 查看已执行阶段的 token 分账
- **WHEN** trace 包含已执行的意图解析、上下文总结、动作推荐、训练计划生成或最终回答阶段
- **THEN** 页面 MUST 展示每个阶段的 `prompt_tokens`、`completion_tokens` 和 `total_tokens`
- **AND** 页面 MUST 展示每个阶段的模型名称、耗时和阶段状态
- **AND** 页面 MUST 保留全链路 token 总计

#### Scenario: 查看被跳过阶段
- **WHEN** trace 包含被 token budget 决策跳过的 AI 阶段
- **THEN** 页面 MUST 展示该阶段为 skipped
- **AND** 页面 MUST 展示服务端记录的跳过原因
- **AND** 页面 MUST 能区分“未命中该流程”和“经过预算决策后跳过”

#### Scenario: Agent decision 模型响应归入工具决策阶段
- **WHEN** trace 包含 Tool-first Agent 的 decision 模型请求和模型响应
- **THEN** 页面 MUST 将请求和响应都归入 `tool_decision` 阶段
- **AND** 该阶段 MUST 展示模型响应的 token usage
- **AND** 页面 MUST NOT 将新 Agent 的模型响应 token 归入 `legacy_compatibility`
- **AND** `legacy_compatibility` 只展示旧链路跳过或旧 trace fallback 信息
