## ADDED Requirements

### Requirement: Trace debugger must explain hardened trace contract
`/dev/ai-traces` SHALL 展示并解释加固后的 trace envelope、step payload、finalDecision、correlation 和 replay snapshot 摘要。

#### Scenario: 查看 trace contract 字段
- **WHEN** 开发者选择一条包含加固契约字段的 trace
- **THEN** 页面 MUST 展示 rootRunId、parentTraceId、sourceTraceId、routeSpanId、continuedRoutes、promptVersion、toolVersions 和 finalDecision
- **AND** 页面 MUST 用中文解释这些字段用于跨接口关联、版本定位、失败分类或 Replay/Eval
- **AND** 缺失字段 MUST 被展示为未记录，而不是让页面空白或报错

#### Scenario: 查看类型化 step payload
- **WHEN** step 包含 typed payload
- **THEN** 页面 MUST 根据 step type 展示对应的关键字段说明
- **AND** 页面 MUST 对 model_request、model_response、tool_call、reference_resolution、candidate_selection、validation、persistence、response_write 和 error 提供可读摘要
- **AND** 未被解释的字段 MUST 继续保留 Raw JSON 入口

#### Scenario: 查看真实耗时
- **WHEN** step 由真实 span 采集并包含 durationMs
- **THEN** 页面 MUST 明确展示 startedAt、endedAt 和 durationMs
- **AND** 页面 SHOULD 能区分真实业务耗时和同步摘要事件

#### Scenario: 查看 Replay/Eval 快照
- **WHEN** trace 或 step 包含 replay/eval snapshot 摘要
- **THEN** 页面 MUST 展示 snapshot 的版本、hash、artifact revision、candidate pool summary、memory summary、policy result 和 validation result
- **AND** 页面 MUST 标明这些字段用于复盘或回归验证，而不是用户可见 payload

#### Scenario: 查看截断长文本
- **WHEN** 长文本字段被截断为 `{ truncated, originalLength, maxLength, preview }`
- **THEN** 页面 MUST 将 preview 作为独立长文本块展示
- **AND** 页面 MUST 展示 originalLength、maxLength 和字数
