## ADDED Requirements

### Requirement: Agent loop timeline is the default trace view
`/dev/ai-traces` SHALL use an Agent loop timeline as the default detail view when a trace contains Tool-first Agent loop evidence.

#### Scenario: 查看 Agent loop 总览
- **WHEN** 开发者选择一条包含 `agent_context_build`、`agent_tool_decision`、`agent_tool_result`、`agent_final_result` 或等价 Agent steps 的 trace
- **THEN** 页面 MUST 默认展示按执行顺序排列的 Agent loop timeline
- **AND** timeline MUST 展示 `LLM 输入`、`LLM 输出解析`、`tool 执行结果`、`下一轮 LLM 输入` 和 `最终回复` 节点
- **AND** 页面 MUST 明确标记本轮是否生成 artifact、patch、suggestion、clarification、blocked、failed 或 answered 结果

#### Scenario: 查看单轮 Agent loop
- **WHEN** 开发者展开某一轮 Agent loop
- **THEN** 页面 MUST 展示本轮 LLM 输入摘要和完整 message content 入口
- **AND** 页面 MUST 展示本轮 LLM 原始输出和解析后的 action、toolName、tool input、reason、usedToolResultIds 或 final result
- **AND** 如果本轮触发 tool，页面 MUST 在同一轮紧邻展示 tool 执行输入、输出、状态、失败 code、toolResultId 和相关 resource id
- **AND** 页面 MUST 展示下一轮 LLM 输入是否包含该 toolResultId 或对应 tool result 摘要

#### Scenario: Agent loop 证据缺失
- **WHEN** trace 包含 Agent steps 但缺少可串联的 model response、tool result、toolResultId 或 next prompt linkage
- **THEN** 页面 MUST 在诊断区标记缺失的证据类型
- **AND** 页面 MUST 保留 Raw JSON 入口
- **AND** 页面 MUST NOT 通过用户文本、中文 step title 或关键词推断缺失关系

### Requirement: LLM input and output are inspectable per Agent turn
`/dev/ai-traces` SHALL make every recorded Agent model exchange inspectable as a paired input/output unit.

#### Scenario: 查看 LLM 输入
- **WHEN** Agent loop turn 包含 `model_request` step
- **THEN** 页面 MUST 展示模型名称、response_format、thinking、prompt modules、remainingSteps 和 timeout 等调用配置
- **AND** 页面 MUST 按 message 顺序展示 system prompt、user payload 和其他 message content
- **AND** 页面 MUST 从 user payload 中提取 `ContextPackage`、registeredTools、toolResults、dependencyGraph、remainingSteps 和 budget 摘要

#### Scenario: 查看 LLM 输出解析
- **WHEN** Agent loop turn 包含 `model_response` step
- **THEN** 页面 MUST 展示原始 content 或 rawResponse 的可读长文本块
- **AND** 页面 MUST 展示解析后的 JSON 结构
- **AND** 页面 MUST 突出 action、toolName、tool input、reason、result status、blockReason、failureCode 和 usedToolResultIds
- **AND** 如果解析失败，页面 MUST 展示解析失败 code、错误详情和原始输出

### Requirement: Tool execution is linked to model decisions
`/dev/ai-traces` SHALL link each Agent tool execution to the LLM decision that requested it and to the later Agent result that consumed it.

#### Scenario: 查看 tool 执行结果
- **WHEN** Agent loop turn 包含 tool decision 和 tool result
- **THEN** 页面 MUST 在同一轮展示 toolName、toolCallId、toolResultId、输入摘要、输出摘要、状态、耗时和失败 code
- **AND** 页面 MUST 展示 candidateSetId、artifactId、validationId、policyDecisionId、confirmationId、revisionId 或其他 resource id 的产生位置
- **AND** 页面 MUST 展示该 tool result 是否被下一轮 LLM 输入、Agent final result、validator、policy、persistence 或 Response Writer 消费

#### Scenario: 发现未消费 tool result
- **WHEN** tool result 已产生但没有出现在后续 visibleToolResultIds、usedToolResultIds、dependency graph 或 final result 引用中
- **THEN** 页面 MUST 标记为 orphaned tool result
- **AND** 页面 MUST 提供产生该结果的 LLM 输出、tool 执行 step 和 Raw JSON 入口

### Requirement: Debug metrics are explained in context
`/dev/ai-traces` SHALL explain trace metrics in the context of Agent loop debugging instead of presenting them as unexplained standalone fields.

#### Scenario: 查看 loop 指标说明
- **WHEN** 页面展示 token usage、durationMs、skip reason、resource id、dependency graph、prompt modules、candidate counts 或 truncation metadata
- **THEN** 页面 MUST 展示该指标的中文含义
- **AND** 页面 MUST 展示该指标主要用于判断的问题类型
- **AND** 指标 MUST 附着在相关 Agent turn、tool result、finalization 或 diagnosis 上，而不是成为默认详情主内容

#### Scenario: 查看 token 与耗时来源
- **WHEN** trace 包含多次 LLM 调用和多个 tool 执行
- **THEN** 页面 MUST 能区分每一次 LLM 调用的 prompt_tokens、completion_tokens、total_tokens 和 durationMs
- **AND** 页面 MUST 能区分每一次 tool 执行的 durationMs 和失败原因
- **AND** 页面 MUST 保留全链路 token 和耗时总计

### Requirement: Agent loop log export is readable
`/dev/ai-traces` SHALL export Agent loop logs in the same causal structure used by the page.

#### Scenario: 保存全链路 log
- **WHEN** 开发者点击保存全链路 log
- **THEN** 系统 MUST 写入包含 Agent loop timeline 的 `codex_logs/ai_trace_log.js`
- **AND** 保存内容 MUST 包含每轮 LLM 输入摘要、LLM 输出解析、tool 执行结果、resource links、diagnostic findings、final result 和用户可见回复摘要
- **AND** 保存内容 MUST 保留 Raw trace 入口或原始 trace payload 摘要，便于人工复查

#### Scenario: 保存用户问答记录
- **WHEN** 开发者点击保存用户问答记录
- **THEN** 系统 MUST 继续只写入用户问题列表和最终文本回答
- **AND** 保存内容 MUST NOT 包含完整 prompt、tool payload、动作卡片、训练计划卡片、权限 token 或敏感字段

## MODIFIED Requirements

### Requirement: Trace flow is step-oriented
`/dev/ai-traces` SHALL 将 AI 调用链路展示为有顺序的流程，让开发者能识别哪个阶段已运行、失败或产生关键输出；当 trace 包含 Tool-first Agent loop evidence 时，流程 MUST 默认按 Agent loop 因果链展示。

#### Scenario: 查看 Agent loop 流程节点
- **WHEN** trace 包含 agent context build、agent tool decision、agent tool result、validator、policy、confirmation、persistence、agent response writer、agent summary update 或等价 Agent steps
- **THEN** 页面 MUST 按 Agent loop 执行顺序展示阶段节点、阶段状态、事件数量、耗时和 token usage
- **AND** 阶段节点 MUST 默认收起，便于开发者先扫描并定位模块
- **AND** 开发者展开某个阶段后，页面 MUST 在当前阶段下方直接展示该阶段的 LLM 输入、LLM 输出解析、tool 执行结果和下一轮输入关联
- **AND** 阶段内部的失败事件、blocked 事件、final result 事件、tool result 缺失事件或首个关键事件 SHOULD 默认展开，便于快速定位关键输出
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
- **AND** 上下文预览 SHOULD 突出 latestUserMessage、ContextPackage、registeredTools、toolResults、dependencyGraph、AgentExecutionResult、validation、recovery 和候选动作池数量
- **AND** 每条发送给模型的 `message.content` MUST 像模型回复一样以独立纵向长文本块展示，不得只依赖 JSON 或与 preview 挤在同一横向卡片内
- **AND** 模型请求或输出中直接出现的长文本 `content`、`preview` 字段 MUST 从 JSON 中提取为独立纵向长文本块；被截断为 `{ preview }` 的长文本也 MUST 按原字段展示
- **WHEN** trace 包含训练 routine 或 plan 草稿输出
- **THEN** 页面 MUST 在 Raw JSON 之外展示计划标题、kind、时长、周期、训练日/休息日、阶段和动作摘要

#### Scenario: 查看重点调试信息
- **WHEN** step 包含 token usage、错误 code、toolName、toolResultId、candidate counts、validation errors、policy result、confirmation state、persistence revision、response write metadata 或 Agent loop linkage
- **THEN** 页面 MUST 优先以可读字段说明展示这些信息
- **AND** 页面 MUST 保留完整 input、output、metadata 和 error 的 Raw JSON 入口
