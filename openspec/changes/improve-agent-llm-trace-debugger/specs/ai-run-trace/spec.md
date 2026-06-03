## ADDED Requirements

### Requirement: 新 agent-core trace 必须记录 Planner / ModelAdapter 调用
系统 SHALL 为新 `agent-core` 文本聊天中的每一次 `LlmPlanner` 模型调用记录可复盘的安全摘要。该摘要 MUST 能说明本次 LLM 看到了什么、返回了什么、解析成了什么 action、消耗了多少 token，以及失败发生在哪个模型调用边界。

#### Scenario: 发送模型请求
- **WHEN** `LlmPlanner` 调用 `ModelAdapter.completeAction()` 生成下一步 `AgentAction` candidate
- **THEN** trace MUST 记录 `model_request` step 或等价模型请求事件
- **AND** step MUST 包含 runId、planner call index、runtime step、model、response_format、temperature、max_tokens、messages 摘要和 manifest/tool count
- **AND** step MUST 包含模型可见的 user payload 摘要，包括 latest user message、registered tools、observations、toolResults、remaining limits 或等价字段
- **AND** step MUST NOT 记录 API key、authorization、cookie、跨用户 payload、完整 tool output 或未经摘要的大 payload

#### Scenario: 收到模型响应
- **WHEN** `ModelAdapter.completeAction()` 收到模型响应并完成解析
- **THEN** trace MUST 记录 `model_response` step 或等价模型响应事件
- **AND** step MUST 包含 model、status、raw text 摘要、parsed JSON/action 摘要、action type、toolName、parse status、failure code 和 diagnostics 中适用的字段
- **AND** step MUST 包含真实 `tokenUsage.prompt_tokens`、`tokenUsage.completion_tokens`、`tokenUsage.total_tokens` 或等价 usage 摘要
- **AND** step MUST 能区分 HTTP 错误、空 content、invalid_json、invalid_action_schema、timeout 和 adapter exception

#### Scenario: 模型响应进入 runtime 校验
- **WHEN** `LlmPlanner` 将 action candidate 返回给 runtime
- **THEN** trace MUST 能通过 planner call index、runtime step 或 action trace id 关联模型响应、`planner_action`、`validation_result` 和最终 runtime status
- **AND** 如果 Action Validator 拒绝该 action，trace MUST 保留模型输出摘要和 validator code

### Requirement: Trace 必须区分真实 token usage 和预算估算
系统 SHALL 同时记录模型供应商返回的真实 token usage 与 runtime 调用前的预算估算，并在字段名和展示语义上明确区分两者。

#### Scenario: 模型返回 usage
- **WHEN** DeepSeek 或其他 ModelAdapter 返回 usage
- **THEN** trace MUST 将 usage 归一化为 `prompt_tokens`、`completion_tokens`、`total_tokens`
- **AND** trace MUST 将该 usage 关联到对应 `model_response` step
- **AND** trace MUST 将全链路模型 usage 汇总到 trace overview 可读取位置

#### Scenario: runtime 使用估算 token 预算
- **WHEN** runtime 在调用 Planner 前计算 `estimated_tokens` budget event
- **THEN** trace MUST 保留该预算估算事件
- **AND** trace MUST NOT 将预算估算展示或导出为真实模型 token usage
- **AND** 如果请求因估算预算耗尽而未调用模型，trace MUST 显示真实 usage 不存在且失败边界为预算控制

### Requirement: Trace 导出必须保留模型调用诊断详情
系统 SHALL 在保存全链路 log 时保留比页面默认展示更完整的脱敏模型调用诊断详情。

#### Scenario: 保存包含模型调用的全链路 log
- **WHEN** 开发者在 `/dev/ai-traces` 保存包含 `model_request` 和 `model_response` 的 trace
- **THEN** `codex_logs/ai_trace_log.js` MUST 包含每次模型调用的 request config、messages 摘要、raw model text 摘要、parsed action、diagnostics、token usage 和 runtime linkage
- **AND** 保存内容 MUST 包含 Raw trace payload 或等价脱敏原始入口
- **AND** 保存内容 MUST NOT 包含 API key、authorization、cookie、完整敏感 payload、跨用户 payload 或完整 tool output
