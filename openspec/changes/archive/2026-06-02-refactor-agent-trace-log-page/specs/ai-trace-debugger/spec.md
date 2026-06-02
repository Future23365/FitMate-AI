## ADDED Requirements

### Requirement: Agent run diagnosis is the default trace entry
`/dev/ai-traces` SHALL use Tool-first Agent run diagnosis as the default detail view when a trace contains Agent stages.

#### Scenario: 查看 Agent trace 总览
- **WHEN** 开发者选择一条包含 Agent stages 的 trace
- **THEN** 页面 MUST 在详情顶部展示 Agent run 总览
- **AND** 总览 MUST 展示 route、status、durationMs、token usage、final result、用户可见回复摘要、关键失败 code、工具调用数量和 legacy path 状态
- **AND** 总览 MUST 明确本轮是否产生 artifact、patch、clarification、blocked、failed 或 answered 结果

#### Scenario: 查看非 Agent trace
- **WHEN** 开发者选择的 trace 不包含 Agent stages
- **THEN** 页面 MUST 保留旧 trace 的流程化展示
- **AND** 页面 MUST 标记该 trace 未记录 Agent run 诊断信息
- **AND** 页面 MUST NOT 将缺少 Agent stages 自动解释为业务失败

### Requirement: Agent tool loop is inspectable
`/dev/ai-traces` SHALL provide a tool loop view that links each Agent tool decision to its execution result and downstream usage.

#### Scenario: 查看工具调用时间线
- **WHEN** trace 包含 `agent_tool_decision`、`agent_tool_result` 或等价 tool loop step
- **THEN** 页面 MUST 按 step index 展示工具调用时间线
- **AND** 每个工具项 MUST 展示 toolName、状态、耗时、参数摘要、输出摘要、失败 code、toolResultId 和模型阶段
- **AND** 页面 MUST 能区分 success、failed、skipped、missing_result、missing_decision 和 unlinked_result 等状态

#### Scenario: 查看工具依赖关系
- **WHEN** tool result 被 Agent final result、validator、policy、persistence 或 Response Writer 使用
- **THEN** 页面 MUST 展示该 tool result 的下游使用位置
- **AND** 页面 MUST 能从工具时间线定位到相关阶段或 Raw JSON

### Requirement: Agent resource ids are cross-linked
`/dev/ai-traces` SHALL index Agent diagnostic resource ids and show where each id is produced and consumed.

#### Scenario: 查看关键资源 id
- **WHEN** trace 包含 candidateSetId、artifactPayloadId、validationId、policyDecisionId、confirmationId、revisionId、toolResultId 或 artifact event id
- **THEN** 页面 MUST 展示资源关联区
- **AND** 每个资源 id MUST 展示产生阶段、消费阶段和相关工具名称
- **AND** 页面 MUST NOT 通过用户文本、step title 或关键词推断资源关系

#### Scenario: 资源 id 缺少下游引用
- **WHEN** trace 中存在已产生但未被 final result、validator、policy、persistence 或 Response Writer 引用的关键资源 id
- **THEN** 页面 MUST 在诊断区展示 orphaned resource 提示
- **AND** 页面 MUST 提供对应 Raw JSON 入口

### Requirement: Agent failures are grouped by architecture boundary
`/dev/ai-traces` SHALL group Agent failures by the architecture boundary where the issue occurred.

#### Scenario: 查看 Agent 失败诊断
- **WHEN** trace 包含 Agent 失败、blocked、repair、schema error、unknown tool、permission error、candidate empty、validation error、policy blocked、persistence error、response writer error 或 post-processing error
- **THEN** 页面 MUST 展示错误聚合区
- **AND** 每个错误 MUST 标记所属边界为 context、tool decision、tool execution、domain gate、persistence、response writer、post-processing 或 legacy compatibility
- **AND** 每个错误 MUST 展示失败 code、可读原因、相关 step、恢复路径或 blocking reason

#### Scenario: 用户可见回复与执行结果不一致
- **WHEN** trace 显示 Response Writer 的用户可见回复承诺了未执行的生成、修改、保存或确认结果
- **THEN** 页面 MUST 将该问题归类为 response writer boundary failure
- **AND** 页面 MUST 展示 final result、用户可见回复和缺失的 resource id 或 tool result 引用

### Requirement: Agent log export includes diagnosis summary
`/dev/ai-traces` SHALL include Agent diagnosis summary when saving full trace logs.

#### Scenario: 保存 Agent 全链路 log
- **WHEN** 开发者在 Agent trace 上点击保存全链路 log
- **THEN** 系统 MUST 继续追加写入 `codex_logs/ai_trace_log.js`
- **AND** 保存内容 MUST 包含 Agent final result、tool timeline、resource links、diagnostic findings、legacy path 状态和用户可见回复摘要
- **AND** 保存内容 MUST 继续包含原始 trace payload 或原始 trace 入口，便于人工复查

#### Scenario: 保存用户问答记录
- **WHEN** 开发者在 Agent trace 上点击保存用户问答记录
- **THEN** 系统 MUST 继续追加写入 `codex_logs/prompt.js`
- **AND** 保存内容 MUST 只包含保存时间、trace 标识、用户问题列表和最终文本回答
- **AND** 保存内容 MUST NOT 包含完整 tool payload、候选池、动作卡片、训练计划卡片、权限 token 或敏感字段

## MODIFIED Requirements

### Requirement: Trace flow is step-oriented
`/dev/ai-traces` SHALL 将 AI 调用链路展示为有顺序的流程，让开发者能识别哪个阶段已运行、失败或产生关键输出；当 trace 包含 Agent stages 时，流程 MUST 默认按 Tool-first Agent 架构组织。

#### Scenario: 查看 Agent 流程节点
- **WHEN** trace 包含 agent context build、agent tool decision、agent tool result、validator、policy、confirmation、persistence、agent response writer、agent summary update 或等价 Agent steps
- **THEN** 页面 MUST 按 Agent 执行顺序展示阶段节点、阶段状态、事件数量、耗时和 token usage
- **AND** 阶段节点 MUST 默认收起，便于开发者先扫描并定位模块
- **AND** 开发者展开某个阶段后，页面 MUST 在当前阶段下方直接展示该阶段的事件内容，不需要滚动到其他区域查看内容
- **AND** 阶段内部的失败事件、blocked 事件、final result 事件或首个关键事件 SHOULD 默认展开，便于快速定位关键输出
- **AND** 页面 MUST 为 ContextPackage、tool loop、validator / policy gate、persistence、Response Writer 和 post-processing step 展示可读摘要

#### Scenario: 查看 legacy 流程节点
- **WHEN** trace 只包含 user input、intent、candidate selection、reference resolution、tool call、patch proposal、model request、model response、validation、persistence 或 final response steps
- **THEN** 页面 MUST 按 legacy 链路顺序展示阶段节点、阶段状态、事件数量、耗时和 token usage
- **AND** 阶段节点 MUST 默认收起，便于开发者先扫描并定位模块
- **AND** 页面 MUST 为 reference resolution、tool call、patch proposal 和 validation step 展示可读摘要

#### Scenario: 请求概览默认收起
- **WHEN** 开发者进入某条 trace 详情
- **THEN** 请求概览 MUST 默认处于收起状态
- **AND** 展开后 MUST 解释 route、status、createdAt、durationMs、tokenUsage、userId、sessionId、messageId、model、promptVersion、finalDecision 和 continuedRoutes 等字段含义

#### Scenario: 查看模型 prompt 和计划草稿
- **WHEN** trace 包含 `model_request` step
- **THEN** 页面 MUST 在 Raw JSON 之外展示模型调用配置、system prompt、user prompt 和可识别 JSON 上下文预览
- **AND** 上下文预览 SHOULD 突出 latestUserMessage、ContextPackage、tool result summaries、AgentExecutionResult、validation、recovery 和候选动作池数量
- **AND** 每条发送给模型的 `message.content` MUST 像模型回复一样以独立纵向长文本块展示，不得只依赖 JSON 或与 preview 挤在同一横向卡片内
- **AND** 模型请求或输出中直接出现的长文本 `content`、`preview` 字段 MUST 从 JSON 中提取为独立纵向长文本块；被截断为 `{ preview }` 的长文本也 MUST 按原字段展示
- **WHEN** trace 包含训练 routine 或 plan 草稿输出
- **THEN** 页面 MUST 在 Raw JSON 之外展示计划标题、kind、时长、周期、训练日/休息日、阶段和动作摘要

#### Scenario: 查看重点调试信息
- **WHEN** step 包含 token usage、错误 code、toolName、toolResultId、candidate counts、validation errors、policy result、confirmation state、persistence revision 或 response write metadata
- **THEN** 页面 MUST 优先以可读字段说明展示这些信息
- **AND** 页面 MUST 保留完整 input、output、metadata 和 error 的 Raw JSON 入口
