## ADDED Requirements

### Requirement: Trace 调试页必须展示 Thinking Mode 诊断边界
`/dev/ai-traces` SHALL 展示每次 Agent LLM 调用的 Thinking Mode 请求配置和 reasoning 响应诊断，帮助开发者确认思考模式是否真实生效。

#### Scenario: 查看 LLM 输入中的 thinking 配置
- **WHEN** 开发者查看包含 `model_request` 的 Agent loop
- **THEN** 页面 MUST 展示最终 model、`thinking.type` 和 `reasoning_effort`
- **AND** 页面 MUST 明确这些字段来自 provider 请求配置，而不是用户可见回复内容

#### Scenario: 查看 LLM 输出中的 reasoning 诊断
- **WHEN** `model_response` trace 包含 reasoning 诊断
- **THEN** 页面 MUST 展示是否收到 `reasoning_content`、长度和脱敏摘要或长文本入口
- **AND** 页面 MUST 同时保留正式 `content` 和 parsed action 的查看入口
- **AND** 页面 MUST NOT 把 `reasoning_content` 当作最终 assistant 用户回复展示

#### Scenario: 保存全链路 log 保留 reasoning 排查能力
- **WHEN** 开发者保存全链路 log
- **THEN** 导出文件 MUST 保留 thinking 配置和 reasoning 诊断摘要
- **AND** 如果保存 reasoning 长文本，导出 MUST 使用现有 `contentRef`、`detailRef` 或等价可追溯引用机制
- **AND** 默认轻量报告 MUST 不内联大段原始 reasoning 文本
