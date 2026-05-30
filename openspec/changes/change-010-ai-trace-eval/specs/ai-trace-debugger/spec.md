## MODIFIED Requirements

### Requirement: Trace flow is step-oriented
`/dev/ai-traces` SHALL 将 AI 调用链路展示为有顺序的流程，让开发者能识别哪个阶段已运行、失败或产生关键输出。

#### Scenario: 查看流程节点
- **WHEN** trace 包含 user input、intent、candidate selection、reference resolution、tool call、patch proposal、model request、model response、validation、persistence 或 final response steps
- **THEN** 页面 MUST 按链路顺序展示阶段节点、阶段状态、事件数量、耗时和 token usage
- **AND** 开发者 MUST 可以选择某个阶段，并在不展开多层子模块的情况下检查该阶段
- **AND** 页面 MUST 为 reference resolution、tool call、patch proposal 和 validation step 展示可读摘要

### Requirement: Raw trace data remains available
`/dev/ai-traces` SHALL 为解释层未覆盖的字段保留原始 trace 数据入口。

#### Scenario: 查看低频字段
- **WHEN** trace, stage, step, input, output, metadata, error, reference resolution result, tool call result, patch proposal, validation result, or persistence result contains fields without explicit explanation
- **THEN** 页面 MUST 为这些值提供原始 JSON 入口
- **AND** 现有保存 log 动作 MUST 继续支持全链路、阶段和单事件目标
