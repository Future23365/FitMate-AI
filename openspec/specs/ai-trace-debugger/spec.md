# ai-trace-debugger Specification

## Purpose
TBD - created by archiving change redesign-ai-trace-debugger. Update Purpose after archive.
## Requirements
### Requirement: Trace overview explains request metadata
`/dev/ai-traces` SHALL 在开发者查看单个步骤前展示请求概览，并解释主要 trace metadata 字段及其本次取值。

#### Scenario: 查看请求概览
- **WHEN** 开发者选择一条 AI trace
- **THEN** 页面 MUST 展示 route、status、createdAt、durationMs、token usage 和 metadata 中主要字段的中文含义与本次值
- **AND** 页面 MUST 保留查看原始 metadata 的入口

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

### Requirement: Intent result is explained
`/dev/ai-traces` SHALL 同时解释主要意图字段的字段含义和本次识别值。

#### Scenario: 查看意图解析结果
- **WHEN** 选中阶段包含 intent step 或 intent extraction model response
- **THEN** 页面 MUST 在字段存在时解释 intentType、targetMuscles、equipmentOrLocation、sessionMinutes、canTriggerAction、missingActionFields 和 confidence 等关键字段
- **AND** 页面 MUST 展示一段简短解释，说明该结果对触发内部动作或继续追问意味着什么

### Requirement: Model request is readable
`/dev/ai-traces` SHALL 让模型调用配置和 prompt messages 比单纯原始 JSON 更容易检查。

#### Scenario: 查看模型请求
- **WHEN** 选中阶段包含带 messages 的 model_request step
- **THEN** 页面 MUST 将模型调用配置和 messages 分开展示
- **AND** 配置字段 MUST 为常见参数提供可读标签和字段含义
- **AND** messages MUST 按 role 和顺序展示为可读内容块

### Requirement: Raw trace data remains available
`/dev/ai-traces` SHALL 为解释层未覆盖的字段保留原始 trace 数据入口。

#### Scenario: 查看低频字段
- **WHEN** trace, stage, step, input, output, metadata, error, reference resolution result, tool call result, patch proposal, validation result, or persistence result contains fields without explicit explanation
- **THEN** 页面 MUST 为这些值提供原始 JSON 入口
- **AND** 现有保存 log 动作 MUST 继续支持全链路、阶段和单事件目标

### Requirement: Conversation memory update is outside the main flow
`/dev/ai-traces` SHALL 将会话记忆更新作为流程步骤切换区中的后处理模块展示，避免和本轮回复生成混在一起。

#### Scenario: 查看会话记忆更新
- **WHEN** trace 包含 `聊天上下文总结` 相关 step
- **THEN** 页面 MUST 在主流程节点之后展示这些 step 的切换入口
- **AND** 页面 MUST 在接口返回后的切换入口前通过分割线标记后处理模块
- **AND** 该模块 MUST 继续支持查看字段解释、原始 JSON 和保存 log

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

#### Scenario: Agent decision 模型响应归入工具决策阶段
- **WHEN** trace 包含 Tool-first Agent 的 decision 模型请求和模型响应
- **THEN** 页面 MUST 将请求和响应都归入 `tool_decision` 阶段
- **AND** 该阶段 MUST 展示模型响应的 token usage
- **AND** 页面 MUST NOT 将新 Agent 的模型响应 token 归入 `legacy_compatibility`
- **AND** `legacy_compatibility` 只展示旧链路跳过或旧 trace fallback 信息

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

### Requirement: 用户问答记录可导出
`/dev/ai-traces` SHALL 允许开发者从当前选中的 trace 导出用户问答记录，用于后续回归测试样本整理。

#### Scenario: 保存当前 trace 的用户问答记录
- **WHEN** 开发者选择一条 AI trace
- **THEN** 页面 MUST 在「保存全链路log」按钮左侧展示「保存用户问答记录」按钮
- **AND** 开发者点击该按钮后，系统 MUST 将记录追加写入 `codex_logs/prompt.js`
- **AND** 现有「保存全链路log」按钮 MUST 继续写入 `codex_logs/ai_trace_log.js`
- **AND** 多次保存用户问答记录 MUST NOT 覆盖 `prompt.js` 中已有记录

#### Scenario: 多轮对话只保存用户问题和最终文本回答
- **WHEN** trace 中包含多轮对话历史或模型请求 messages
- **THEN** `prompt.js` MUST 按原始顺序保存 trace 可见的用户问题
- **AND** `prompt.js` MUST 保存最终展示给用户的文本回答
- **AND** `prompt.js` MUST NOT 保存动作卡片、训练计划卡片、候选动作池、校验详情或完整 trace payload

#### Scenario: 输出格式便于人工阅读
- **WHEN** `prompt.js` 被写入
- **THEN** 文件内容 MUST 使用清晰命名的 CommonJS 记录列表
- **AND** 文件内容 MUST 包含保存时间、trace 标题或标识、用户问题列表和最终回答文本
- **AND** 保存时间 MUST 使用本地时区格式，便于和本机调试日志对齐

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
- **AND** 页面 MUST 展示 candidateSetId、artifactId、validationId、policyDecisionId、confirmationId、revisionId 或其他 resource id 的产生位置（如果存在）
- **AND** 页面 MUST 展示该 tool result 是否被下一轮 LLM 输入、Agent final result、validator、policy、persistence 或 Response Writer 消费
- **AND** 页面 MUST 将通用 `tool_execution` runtime event 展示为可展开的 tool step，包含 Input、Output、Metadata 和 Raw JSON 入口

#### Scenario: 保存全链路 log 包含 tool 执行证据
- **WHEN** 开发者点击保存全链路 log
- **THEN** 导出的 `codex_logs/ai_trace_log.js` MUST 包含逐 tool 的 execution step 或等价 runtime event
- **AND** 导出内容 MUST 包含 toolName、toolResultId、input summary、output summary、status、durationMs 和 failureCode
- **AND** 导出内容 MUST NOT 包含完整 handler output、权限 token、cookie、API key 或未脱敏大 payload

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
`/dev/ai-traces` SHALL export Agent loop logs in the same causal structure used by the page, while separating long text from the default report.

#### Scenario: 保存全链路 log
- **WHEN** 开发者点击保存全链路 log
- **THEN** 系统 MUST 写入包含 Agent loop timeline 的轻量报告 `codex_logs/ai_trace_log.js`
- **AND** 保存内容 MUST 包含每轮 LLM 输入摘要、LLM 输出解析、tool 执行结果、resource links、diagnostic findings、final result 和用户可见回复摘要
- **AND** 保存内容 MUST 将超过导出阈值的长文本替换为 `contentRef` 引用
- **AND** 被引用的长文本 MUST 写入 `codex_logs/ai_trace_texts.jsonl`
- **AND** 模型请求 message content 已在上游 trace 中以 chunks 保存时，导出层 MUST 合并 chunks 并只在报告中留下 `contentRef`
- **AND** 保存内容 MUST 使用 step summary 或 trace summary 代替完整 Raw trace 对象
- **AND** 被 step summary 或 trace summary 代替的完整结构化详情 MUST 能通过 `detailRef` 在映射文件中找回
- **AND** 报告 MUST 保留足够定位问题的 code、id、状态、step、token usage、hash 和路径信息，便于只读报告完成常规排查

#### Scenario: 保存用户问答记录
- **WHEN** 开发者点击保存用户问答记录
- **THEN** 系统 MUST 继续只写入用户问题列表和最终文本回答
- **AND** 保存内容 MUST NOT 包含完整 prompt、tool payload、动作卡片、训练计划卡片、权限 token、敏感字段或长文本映射

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

### Requirement: Trace 页面必须展示当前文本聊天 trace
`/dev/ai-traces` SHALL 能列出并展示当前新 `agent-core` 文本聊天主链写入的 `AiTrace`。页面 MUST 保留通用历史 trace 查看器能力，并提供 Raw JSON 入口。

#### Scenario: 开发者查看最新文本聊天 trace
- **WHEN** 已认证用户完成一次进入文本聊天接入服务的 `/api/chat` 请求
- **THEN** `/api/dev/ai-traces` MUST 返回该用户可见的最新 trace
- **AND** `/dev/ai-traces` MUST 在列表中展示该 trace 的标题、route、状态、创建时间和耗时
- **AND** 页面 MUST 允许开发者选择该 trace 查看步骤详情和请求概览

#### Scenario: 只显示当前用户 trace
- **WHEN** 开发态 trace store 中存在多个用户的 trace
- **THEN** `/api/dev/ai-traces` MUST 只返回当前 `CurrentUser.id` 对应的 trace
- **AND** 页面 MUST NOT 展示其他用户的 trace payload

#### Scenario: 文本聊天没有业务 tool
- **WHEN** 当前文本聊天 trace 的 registry 为空且没有业务 tool result
- **THEN** 页面 MUST 仍展示请求输入、runtime 事件、validation、response write 和 error 中已记录的步骤
- **AND** 页面 MUST NOT 把“未记录业务 tool”或“未记录旧 Agent run 诊断”当作业务失败

### Requirement: Trace 页面导出必须包含文本聊天 trace 摘要
`/dev/ai-traces` SHALL 支持将当前文本聊天 trace 导出到现有开发日志文件。导出 MUST 保留可读分组摘要、长文本映射入口和 Raw trace 摘要，并继续遵守脱敏边界。

#### Scenario: 保存全链路 log
- **WHEN** 开发者选择当前文本聊天 trace 并点击保存全链路 log
- **THEN** 系统 MUST 写入轻量报告 `codex_logs/ai_trace_log.js`
- **AND** 系统 MUST 写入长文本映射 `codex_logs/ai_trace_texts.jsonl`
- **AND** `ai_trace_log.js` MUST 包含 trace 标题、route、状态、runtime event 摘要、响应事件摘要、模块分组、模型调用摘要、token usage 和 Raw trace 摘要
- **AND** `ai_trace_log.js` MUST NOT 内联完整 `rawTrace` 或完整 `trace` payload
- **AND** `ai_trace_log.js` MUST 使用 `contentRef`、`path`、`kind`、`originalLength`、`hash` 和 `preview` 引用被抽离的长文本
- **AND** `ai_trace_log.js` MUST 使用 `detailRef` 引用被瘦身掉的完整 `trace` 和 runtime event 结构化详情
- **AND** `ai_trace_texts.jsonl` MUST 以一行一个 JSON object 保存与 `contentRef` 对应的脱敏长文本 header/chunk records
- **AND** `ai_trace_texts.jsonl` MUST 保存与 `detailRef` 对应的脱敏结构化详情 header/chunk records
- **AND** 模型请求 trace 中超过 adapter 摘要阈值的 message content MUST 能以分块 envelope 进入导出层，并在 `ai_trace_texts.jsonl` 中恢复为单条长文本映射
- **AND** `ai_trace_texts.jsonl` SHOULD 按 hash 去重保存重复长文本，并在记录中保留出现路径
- **AND** `ai_trace_texts.jsonl` SHOULD 将超长 content 拆成多个 chunk records，避免单条 JSONL 记录过长
- **AND** `ai_trace_texts.jsonl` 的 chunk records MUST 使用 `parentRef` 指向对应 `contentRef` 或 `detailRef`，避免按 header ref 查询时直接打印所有 chunk 内容
- **AND** 两个文件 MUST 在每次保存全链路 log 时覆盖上一次导出，不新增导出目录或历史版本
- **AND** 两个文件 MUST 包含注释，说明默认先读轻量报告，按 `contentRef` / `detailRef` 查询 header，并按 `parentRef` 查询 chunk 内容
- **AND** 保存内容 MUST NOT 包含 API key、authorization、cookie、跨用户 payload、完整敏感 payload 或完整 tool output

#### Scenario: 保存用户问答记录
- **WHEN** 开发者选择当前文本聊天 trace 并点击保存用户问答记录
- **THEN** 系统 MUST 追加写入 `codex_logs/prompt.js`
- **AND** 保存内容 MUST 只包含保存时间、trace 标识、用户问题列表和最终文本回答
- **AND** 保存内容 MUST NOT 保存完整 tool payload、候选池、校验详情、完整 trace payload 或长文本映射文件

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
`/dev/ai-traces` SHALL 默认展示对定位问题有用的模块摘要和关键字段，低频或大体积字段必须保留在展开区或 Raw JSON / 保存 log 中；保存 log 时长文本 MUST 可按引用追溯。

#### Scenario: 默认查看 trace
- **WHEN** 开发者打开 trace 详情
- **THEN** 页面 MUST 优先展示模块状态、关键 code、关键 id、LLM 调用轮次、token usage、失败边界和用户可见响应摘要
- **AND** 页面 MUST 默认隐藏完整 messages、完整 Raw JSON、长文本 payload 和低频 metadata
- **AND** 页面 MUST 提供明确入口展开这些隐藏诊断

#### Scenario: 保存全链路 log
- **WHEN** 开发者点击保存全链路 log
- **THEN** 保存 payload MUST 包含页面模块结构、每个模块的关键摘要、模型调用诊断详情、runtime traceEvents、response summary 和 Raw trace 摘要
- **AND** 保存 payload MUST 将长文本外置为 `contentRef` 映射，并在报告中保留查询长文本所需的路径、hash、长度和预览
- **AND** 保存 payload MUST NOT 因 adapter 级 800 字符摘要丢失完整模型请求 message 的尾部内容
- **AND** 保存 payload MUST NOT 重复保存完整 `rawTrace` 和完整 `trace` 对象
- **AND** 保存 payload MUST NOT 丢弃被默认报告瘦身掉的完整 `rawTrace` / `trace`、runtime event `input` / `output` / `metadata` / `error`，这些内容 MUST 通过 `detailRef` 外置
- **AND** 保存 payload 和长文本映射 MUST 继续经过脱敏

#### Scenario: 保存用户问答记录
- **WHEN** 开发者点击保存用户问答记录
- **THEN** 保存内容 MUST 继续只包含保存时间、trace 标识、用户问题列表和最终文本回答
- **AND** 保存内容 MUST NOT 包含完整 prompt、模型 raw output、tool payload、traceEvents、Raw trace payload 或长文本映射

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

