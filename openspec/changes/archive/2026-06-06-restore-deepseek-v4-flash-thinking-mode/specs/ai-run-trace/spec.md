## ADDED Requirements

### Requirement: Trace 必须记录 DeepSeek Thinking Mode 请求与响应诊断
系统 SHALL 在 Agent LLM 调用 trace 中记录 DeepSeek Thinking Mode 的请求配置和响应诊断，使开发者能确认前端 `thinkingEnabled` 是否真正进入 provider 请求。

#### Scenario: 模型请求记录 thinking 配置
- **WHEN** `DeepSeekModelAdapter` 构造模型请求 trace
- **THEN** `model_request` 或等价 trace envelope MUST 记录最终 model
- **AND** trace MUST 记录 `thinking.type`
- **AND** trace MUST 在 Thinking Mode 开启时记录 `reasoning_effort`
- **AND** trace MUST 不记录 API key、authorization、cookie 或未经脱敏的大 payload

#### Scenario: 模型响应记录 reasoning 诊断
- **WHEN** DeepSeek 响应包含 `reasoning_content`
- **THEN** `model_response` 或等价 trace envelope MUST 记录已收到 reasoning 的事实
- **AND** trace MUST 记录 `reasoning_content` 长度、脱敏摘要或可追溯长文本引用
- **AND** trace MUST 区分正式 `content` 与 `reasoning_content`
- **AND** parse status、failureCode 和 parsed action MUST 继续基于正式 `content`

#### Scenario: 关闭思考模式也有可诊断证据
- **WHEN** `/api/chat` 请求中 `thinkingEnabled = false`
- **THEN** trace MUST 能展示 provider 请求包含 `thinking.type = "disabled"` 或等价禁用证据
- **AND** 若响应仍包含 `reasoning_content`，trace MUST 标记为诊断异常或 provider 行为差异，而不得把它展示给用户
