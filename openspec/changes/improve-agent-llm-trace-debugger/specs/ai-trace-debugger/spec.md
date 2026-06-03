## ADDED Requirements

### Requirement: Trace 调试页必须按架构模块展示
`/dev/ai-traces` SHALL 按 `docs/agent-tool-orchestrator-design.md` 的职责边界展示新 `agent-core` 文本聊天 trace，而不是只按低层 step type 粗略分组。

#### Scenario: 查看模块总览
- **WHEN** 开发者选择一条包含新 `agent-core` 文本聊天证据的 trace
- **THEN** 页面 MUST 展示模块总览，至少包含入口与上下文、ToolRegistry/Manifest、Planner/ModelAdapter、Runtime/Validator、Policy/Resource、Response Renderer、错误诊断和 Raw/导出入口
- **AND** 每个模块 MUST 展示 status、step count、durationMs、token usage 或 skip reason 中适用的摘要
- **AND** 页面 MUST 明确标记本轮仍使用空 `ToolRegistry`，且没有业务 tool 或旧 Agent 事件参与

#### Scenario: 查看 Planner / ModelAdapter 模块
- **WHEN** trace 包含 `model_request`、`model_response` 或 planner diagnostics
- **THEN** 页面 MUST 在 Planner / ModelAdapter 模块中展示模型名称、调用轮次、请求配置、messages 摘要、raw output 摘要、parsed action、parse status、failure code 和 token usage
- **AND** 页面 MUST 将真实 token usage 与 runtime estimated token budget 分开展示
- **AND** 页面 MUST 提供展开入口查看脱敏后的 messages 和 Raw JSON

#### Scenario: 查看 Runtime / Validator 模块
- **WHEN** trace 包含 `planner_action`、`validation_result`、`budget_event`、`terminal_grounding` 或 runtime status
- **THEN** 页面 MUST 在 Runtime / Validator 模块展示 action type、toolName、validator ok/code、预算事件、terminal action/error 和 repair/failure 边界
- **AND** 页面 MUST NOT 通过用户文本、step title 或关键词推断不存在的 tool 消费关系

#### Scenario: 查看 Response Renderer 模块
- **WHEN** trace 包含 response write 或 final response 摘要
- **THEN** 页面 MUST 展示真实返回给前端的 NDJSON event types、content 摘要、suggestion count、error code 和 done 状态
- **AND** 页面 MUST 能让开发者对照模型输出、runtime terminal action 和用户可见响应

### Requirement: 页面默认只显示排查有用信息
`/dev/ai-traces` SHALL 默认展示对定位问题有用的模块摘要和关键字段，低频或大体积字段必须保留在展开区或 Raw JSON / 保存 log 中。

#### Scenario: 默认查看 trace
- **WHEN** 开发者打开 trace 详情
- **THEN** 页面 MUST 优先展示模块状态、关键 code、关键 id、LLM 调用轮次、token usage、失败边界和用户可见响应摘要
- **AND** 页面 MUST 默认隐藏完整 messages、完整 Raw JSON、长文本 payload 和低频 metadata
- **AND** 页面 MUST 提供明确入口展开这些隐藏诊断

#### Scenario: 保存全链路 log
- **WHEN** 开发者点击保存全链路 log
- **THEN** 保存 payload MUST 包含页面模块结构、每个模块的关键摘要、模型调用诊断详情、runtime traceEvents、response summary 和 Raw trace
- **AND** 保存 payload MUST 继续经过脱敏和截断

#### Scenario: 保存用户问答记录
- **WHEN** 开发者点击保存用户问答记录
- **THEN** 保存内容 MUST 继续只包含保存时间、trace 标识、用户问题列表和最终文本回答
- **AND** 保存内容 MUST NOT 包含完整 prompt、模型 raw output、tool payload、traceEvents 或 Raw trace payload
