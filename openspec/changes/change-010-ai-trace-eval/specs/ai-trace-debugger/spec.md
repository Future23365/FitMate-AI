## MODIFIED Requirements

### Requirement: Trace flow is step-oriented
`/dev/ai-traces` SHALL 将 AI 调用链路展示为有顺序的流程，让开发者能识别哪个阶段已运行、失败或产生关键输出。

#### Scenario: 查看流程节点
- **WHEN** trace 包含 user input、intent、candidate selection、reference resolution、tool call、patch proposal、model request、model response、validation、persistence 或 final response steps
- **THEN** 页面 MUST 按链路顺序展示阶段节点、阶段状态、事件数量、耗时和 token usage
- **AND** 阶段节点下面 MUST 直接展示该阶段的事件内容，开发者不需要先点步骤再滚动到其他区域查看内容
- **AND** 失败事件、草稿生成事件或阶段首个事件 SHOULD 默认展开，便于快速定位关键输出
- **AND** 页面 MUST 为 reference resolution、tool call、patch proposal 和 validation step 展示可读摘要

#### Scenario: 请求概览默认收起
- **WHEN** 开发者进入某条 trace 详情
- **THEN** 请求概览 MUST 默认处于收起状态
- **AND** 展开后 MUST 解释 route、status、createdAt、durationMs、tokenUsage、userId、sessionId、messageId、model、promptVersion、finalDecision 和 continuedRoutes 等字段含义

#### Scenario: 查看模型 prompt 和计划草稿
- **WHEN** trace 包含 `model_request` step
- **THEN** 页面 MUST 在 Raw JSON 之外展示模型调用配置、system prompt、user prompt 和可识别 JSON 上下文预览
- **AND** 上下文预览 SHOULD 突出 latestUserMessage、conversationSummary、intent、validation、recovery 和候选动作池数量
- **WHEN** trace 包含训练 routine 或 plan 草稿输出
- **THEN** 页面 MUST 在 Raw JSON 之外展示计划标题、kind、时长、周期、训练日/休息日、阶段和动作摘要

#### Scenario: 查看重点调试信息
- **WHEN** step 包含 token usage、错误 code、toolName、Patch operation、candidate counts、validation errors、persistence revision 或 response write metadata
- **THEN** 页面 MUST 优先以可读字段说明展示这些信息
- **AND** 页面 MUST 保留完整 input、output、metadata 和 error 的 Raw JSON 入口

### Requirement: Raw trace data remains available
`/dev/ai-traces` SHALL 为解释层未覆盖的字段保留原始 trace 数据入口。

#### Scenario: 查看低频字段
- **WHEN** trace, stage, step, input, output, metadata, error, reference resolution result, tool call result, patch proposal, validation result, or persistence result contains fields without explicit explanation
- **THEN** 页面 MUST 为这些值提供原始 JSON 入口
- **AND** 现有保存 log 动作 MUST 继续支持全链路、阶段和单事件目标
