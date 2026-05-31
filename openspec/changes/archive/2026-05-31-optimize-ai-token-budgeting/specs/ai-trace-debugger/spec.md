## ADDED Requirements

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

### Requirement: Trace 展示上下文裁剪摘要
`/dev/ai-traces` SHALL 展示模型输入的上下文裁剪结果，帮助开发者确认 LLM 没有接收完整历史消息或完整动作数据库记录。

#### Scenario: 查看模型请求上下文边界
- **WHEN** 开发者查看 model_request step
- **THEN** 页面 MUST 展示本次启用的 prompt modules
- **AND** 页面 MUST 展示是否使用 `conversationSummary` 和最新用户消息
- **AND** 页面 MUST 展示候选动作裁剪前数量、裁剪后数量和模型可见字段摘要

#### Scenario: 查看原始 trace
- **WHEN** 开发者打开原始 JSON
- **THEN** 原始 trace MUST 包含 token budget 决策结果
- **AND** 原始 trace MUST 不要求默认保存完整模型响应正文才能理解 token 分账
