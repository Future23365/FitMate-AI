# ai-run-trace Specification

## Purpose
TBD - created by archiving change change-010-ai-trace-eval. Update Purpose after archive.
## Requirements
### Requirement: AI 编排必须记录基础 AiRunTrace
系统 SHALL 为关键 AI 编排请求记录 `AiRunTrace`，使开发者能复盘 Agent 输入、工具调用、依赖图和最终执行结果。

#### Scenario: 聊天请求触发 AI 编排
- **WHEN** `/api/chat` 触发 Agent 编排、工具调用、Patch、训练卡片生成、澄清或受控写入
- **THEN** 系统 MUST 创建包含 `runId`、`userId`、`sessionId`、`messageId` 和 `createdAt` 的 trace
- **AND** trace MUST 记录模型、Agent prompt version、tool registry version 和 tool versions
- **AND** trace MUST 记录本轮 `latestUserMessage`
- **AND** trace MUST 记录当前 run 使用的 `ContextPackage` 摘要和 artifact 摘要，而不是无权限的大 payload 集合

#### Scenario: AI 编排完成
- **WHEN** AI 编排流程完成或失败
- **THEN** trace MUST 记录 `AgentExecutionResult` 或标准化失败结果
- **AND** trace MUST 能区分成功、需要澄清、policy blocked、可恢复失败和硬失败

### Requirement: Trace 必须保护权限和隐私边界
系统 SHALL 在记录 trace 前执行权限和敏感字段边界控制。

#### Scenario: 工具读取 artifact payload
- **WHEN** `getArtifactPayload` 返回 artifact payload
- **THEN** trace MUST 只记录当前 `userId` 有权访问的结果
- **AND** trace MUST NOT 记录其他用户 artifact、session 或 schedule 的 payload

#### Scenario: trace 字段包含长文本或大 payload
- **WHEN** step input 或 output 超过系统配置的 trace 长度预算
- **THEN** 系统 MUST 截断或摘要化该字段
- **AND** trace MUST 保留足够定位问题的 code、id、状态和摘要信息

### Requirement: Trace 必须记录 stale artifact revision 解析
系统 SHALL 在受控 artifact payload 读取发生 revision 解析时，记录足够诊断 stale artifact id 的 trace 信息。

#### Scenario: 旧 artifactId 被解析到 active revision
- **WHEN** 受控工具读取 artifact payload 时将原始 artifactId 解析到不同的 active artifactId
- **THEN** trace 的 `tool_call` step MUST 记录原始 artifactId
- **AND** trace 的 `tool_call` step MUST 记录最终读取的 active artifactId
- **AND** trace MUST NOT 记录未授权 artifact payload

#### Scenario: revision 解析失败
- **WHEN** 受控工具无法将原始 artifactId 解析到可访问 active artifact
- **THEN** trace 的 `tool_call` step MUST 记录失败 code 和可诊断原因
- **AND** 用户可见回复 MUST 继续使用可恢复失败引导

### Requirement: Trace 必须记录 Agent decision JSON 恢复证据
系统 SHALL 在 Agent decision 模型输出发生 JSON 格式恢复时记录可诊断 trace，使开发者能区分严格解析失败、非语义格式恢复、恢复后 schema 失败和最终执行结果。

#### Scenario: Agent decision JSON 恢复成功
- **WHEN** Agent decision 模型响应严格 JSON 解析失败，但非语义 JSON 格式恢复成功
- **THEN** trace MUST 记录原始解析失败 code 和错误详情
- **AND** trace MUST 记录恢复方式、恢复后的 parse status 和模型阶段
- **AND** trace MUST 记录恢复后的 decision action、toolName 或 final result status

#### Scenario: Agent decision JSON 恢复后继续执行工具
- **WHEN** 恢复后的 Agent decision 通过 Schema、registry 和工具输入校验
- **THEN** trace MUST 能关联恢复后的 decision step、后续 tool call、tool result 和 dependency graph
- **AND** trace MUST 保留原始模型响应摘要，便于确认恢复没有改变语义字段

#### Scenario: Agent decision JSON 恢复失败
- **WHEN** Agent decision 模型响应无法恢复为唯一合法 JSON object
- **THEN** trace MUST 继续记录 `invalid_json` 或等价失败 code
- **AND** trace MUST 记录失败边界为 `agent_tool_decision`
- **AND** trace MUST NOT 标记为已恢复

### Requirement: Trace 必须记录 Agent artifact revision 恢复
系统 SHALL 在 Agent 工具读取 artifact payload 或基于 artifact 生成 routine 时记录 requested/active artifact revision 关系。

#### Scenario: Agent 工具恢复 artifact revision
- **WHEN** Agent 工具将 requested artifact id 恢复到不同的 active artifact id
- **THEN** trace MUST 记录 requested artifact id
- **AND** trace MUST 记录 active artifact id
- **AND** trace MUST 记录 revision resolution 状态
- **AND** trace MUST NOT 记录未授权 payload

### Requirement: Trace 必须记录重复工具失败熔断
系统 SHALL 在 Agent runtime 熔断重复不可重试工具失败时记录可诊断证据。

#### Scenario: 重复工具失败被熔断
- **WHEN** runtime 因相同工具和相同归一化输入已有不可重试失败而阻止再次执行工具
- **THEN** trace MUST 记录 duplicate failure code
- **AND** trace MUST 记录原始失败 tool result id
- **AND** trace MUST 记录重复次数或等价计数
- **AND** trace MUST 能区分真实底层工具执行失败和 runtime 熔断

### Requirement: Trace 必须区分模型错误、合同拒绝和服务端事实收口
系统 SHALL 在 trace phase 与 step metadata 中区分模型原始输出、runtime 合同校验、结构化反馈和服务端 final result 投影。

#### Scenario: final result 被服务端投影补齐
- **WHEN** runtime 从已登记写工具结果投影 `AgentExecutionResult.generated` 或 `patched`
- **THEN** trace MUST 记录投影来源 tool result id
- **AND** trace MUST 记录模型原始 final result 缺失或错误的字段
- **AND** trace MUST 记录投影后引用校验结果

#### Scenario: final result 引用未登记资源
- **WHEN** 模型 final result 引用没有 producer 的资源 id
- **THEN** trace MUST 记录资源 kind、资源 id、缺失 producer 的原因和是否进入可恢复 feedback

#### Scenario: 黑盒报告读取修复证据
- **WHEN** 手动 LLM 黑盒 runner 消费 Agent stream 或 trace 摘要
- **THEN** 报告 MUST 能读取 `repairFeedbackCodes`、`repairTurnCount`、`finalProjectionSourceToolResultId`、`unregisteredResourceReferences`、`fusedFailureCount` 和 `repairBudgetExhaustedReason`
- **AND** 报告 MUST 区分 recovered、fused、unrecoverable 和 projected 四类结果
- **AND** 报告 MUST NOT 依赖旧 `assistant_action` 或自由文本关键字判断修复是否发生

### Requirement: 新 agent-core 文本聊天必须投影 AgentRunResult trace
系统 SHALL 将新 `agent-core` 文本聊天运行产生的 `AgentRunResult.traceEvents` 投影到开发态 `AiTrace`。投影 MUST 使用字段白名单、脱敏和截断，不得把完整 tool output、secret、cookie、authorization 或跨用户 payload 写入 trace。

#### Scenario: Agent run 输入被记录
- **WHEN** `/api/chat` 构造 `AgentRunInput` 并进入文本聊天 runtime
- **THEN** trace MUST 记录 `runId`、当前 `userId`、`conversationId`、`responseMessageId`、最新用户消息摘要和 hydration 摘要
- **AND** trace MUST 记录当前 registry 为空或等价 tool count
- **AND** trace MUST NOT 记录认证 cookie、API key、authorization header 或未经摘要的大 payload

#### Scenario: runtime traceEvents 被记录
- **WHEN** `runAgentRuntime()` 返回 `AgentRunResult`
- **THEN** trace MUST 记录 `registry_snapshot`、`budget_event`、`planner_action`、`validation_result`、`terminal_grounding`、`policy_decision`、`resource_registered` 或等价 runtime event 的安全摘要
- **AND** 每个 runtime event 摘要 MUST 保留 event type、step、action type、toolName、budget、status、code 或可诊断 id 中适用的字段
- **AND** trace MUST NOT 通过用户文本或 step title 推断不存在的 tool 消费关系

#### Scenario: terminal action 和错误被记录
- **WHEN** `AgentRunResult` 以 completed、needs_input、requires_confirmation 或 failed 结束
- **THEN** trace MUST 记录 runtime status、terminal action type、terminal error code、steps 和 replay summary 中的安全摘要
- **AND** failed trace MUST 能定位失败边界是配置、planner、runtime validation、budget、unknown tool 还是 response projection

#### Scenario: 响应投影被记录
- **WHEN** 系统将 `AgentRunResult` 投影为 NDJSON 事件
- **THEN** trace MUST 记录真实返回事件的类型列表、最终文本摘要、建议回复数量、错误 code 和 `done` 是否输出
- **AND** trace 中的响应摘要 MUST 来自同一份即将返回给前端的事件数组

#### Scenario: trace 字段超出预算
- **WHEN** trace input、output、metadata 或 error 字段包含长文本或大对象
- **THEN** 系统 MUST 截断或摘要化该字段
- **AND** trace MUST 保留足够定位问题的 code、id、状态和摘要信息

### Requirement: 文本聊天 trace 必须证明旧路径未参与
系统 SHALL 在新 `agent-core` 文本聊天 trace 中记录当前生产链路边界，证明旧 intent-first、旧只读 tool loop、旧 `agent-orchestrator` 和旧兼容事件没有参与本轮执行。

#### Scenario: 文本聊天 trace 标记当前链路
- **WHEN** `/api/chat` 完成一次文本聊天 run
- **THEN** trace MUST 记录本轮使用的是 `agent-core` 文本聊天接入、空 `ToolRegistry` 和默认 Response Renderer
- **AND** trace MUST 标记旧 `agent-orchestrator`、旧 `assistant_action`、旧 `intent_resolved` 和旧业务 card event 未参与当前响应

#### Scenario: 架构扫描验证旧路径缺席
- **WHEN** 本 change 完成实现
- **THEN** 自动化测试 MUST 证明 `/api/chat` 和文本聊天接入服务没有导入旧 `agent-orchestrator`
- **AND** 自动化测试 MUST 证明 route 没有通过关键词、正则、同义词或业务 toolName 分支选择执行路径

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

### Requirement: 新 agent-core trace 必须记录 tool 执行事件
系统 SHALL 为每一次通过 Runtime / Executor 执行的 Agent tool 记录通用 `tool_execution` trace event，作为模型决策、执行结果、资源登记和最终回答之间的可复盘证据。

#### Scenario: 记录成功 tool 执行
- **WHEN** Runtime 校验 `tool_call`、Policy Guard 允许执行，并完成 `executeTool()`
- **THEN** trace MUST 记录 `tool_execution` event
- **AND** event MUST 包含 `step`、`toolName`、`toolVersion`、`toolCallId`、`toolResultId`、`normalizedInputHash`、`inputSummary`、`ok`、`satisfied`、`fulfillment`、`projectionSummary`、`startedAt`、`completedAt` 和 `durationMs`
- **AND** event MUST 关联 produced / consumed resource refs（如果存在）
- **AND** event MUST NOT 包含完整 handler output、未脱敏敏感字段、数据库内部对象或 API credential

#### Scenario: 记录失败 tool 执行
- **WHEN** `executeTool()` 返回失败、output schema 校验失败、handler 失败、timeout、abort 或 resource contract validation 失败
- **THEN** trace MUST 记录 `tool_execution` event
- **AND** event MUST 包含失败后的最终 `toolResultId`、`toolName`、`ok = false`、`satisfied = false`、`failureCode` 和已脱敏错误摘要
- **AND** event MUST 保留 input hash 和 input summary，便于判断是否是重复输入或 schema 边界问题

#### Scenario: 重复失败熔断不再次调用 handler
- **WHEN** Runtime 因重复非重试 tool 失败触发 duplicate failure fuse
- **THEN** trace MUST 记录 `tool_execution` event
- **AND** event MUST 标记该结果来自 duplicate failure fuse 或等价 reason
- **AND** event MUST NOT 伪装为 handler 已重新执行

#### Scenario: confirmation resume 执行 tool
- **WHEN** confirmation resume 读取服务端保存的 pending `tool_call` 并执行 tool
- **THEN** trace MUST 记录 `tool_execution` event
- **AND** event MUST 使用服务端 pending action 的 input summary，而不是客户端重传的新 input

### Requirement: Trace 必须展示 Planner 输入去重证据
系统 SHALL 在 model request trace、runtime trace 或 replay summary 中记录足够诊断 Planner input 去重的安全摘要。trace MUST 能说明成功 tool facts 的详细权威通道、observation 轻量化结果，以及 repair / diagnostic observation 保留情况。

#### Scenario: model request trace 记录去重摘要
- **WHEN** model adapter 记录 Planner model request trace
- **THEN** trace MUST 记录 observationCount 和 toolResultCount
- **AND** trace MUST 记录或可派生成功 tool observation lightweight count、repair / diagnostic observation count 和 toolResults projection presence 摘要
- **AND** trace MUST NOT 记录完整 handler output、secret、authorization、cookie、跨用户 payload 或未脱敏大 payload

#### Scenario: trace 可诊断双通道回归
- **WHEN** 某次回归导致成功 tool result 的完整 `projection.model` 同时进入 `observations` 和 `toolResults`
- **THEN** 相关 trace / replay 测试 MUST 能失败或报告该重复事实通道
- **AND** 失败报告 MUST 指向 Planner input builder 或 observation projection，而不是要求新增服务端语义分流

### Requirement: AI trace 必须记录 Agent loop 的可诊断事实链
系统 SHALL 在 AI trace 中记录 Agent loop 的关键诊断事实，使开发者可以复盘模型请求、tool execution、repair feedback、terminal validation 和 response rendering 的边界。

#### Scenario: 记录 tool result 与最终输出校验的分层
- **WHEN** Agent run 执行 tool 并进入 terminal action 或 repair
- **THEN** trace MUST 区分 tool execution status、tool result fact summary、duplicate input feedback、terminal output validation 和 response rendering
- **AND** trace MUST NOT 把中间 tool result 的候选数量或业务诊断投影成 core 业务成功 / 失败判定
- **AND** trace SHOULD 显示普通 `final_answer` 引用的是哪个 current-run `toolResultId` 或 resource
- **AND** trace SHOULD 显示结构化 `visibleOutputs` 是否通过最终 validator，以及失败 code / path / outputType / schemaVersion

#### Scenario: 0 条结果可复盘
- **WHEN** tool 成功执行并返回 0 条结果
- **THEN** trace MUST 保留安全摘要说明该 tool `ok = true`、结果为空和对应 filters / diagnostics 摘要
- **AND** 如果 Planner 用该结果输出普通 `final_answer`，trace MUST 将该 run 记录为合法 terminal answer，而不是 repair failure
- **AND** 如果 Planner 用该结果伪造结构化输出，trace MUST 将失败归因到 final output validator，而不是 tool result 业务满足度

#### Scenario: duplicate input 命名不表达业务成功
- **WHEN** runtime 检测到相同 `toolName + toolVersion + normalizedInputHash` 重复调用
- **THEN** trace MUST 记录 duplicate input 或等价中性事件
- **AND** trace MUST 包含既有 `toolResultId`、重复次数和安全 input hash
- **AND** trace MUST NOT 使用 `duplicate_tool_success` 或等价命名表达业务目标已成功

### Requirement: Trace 必须记录 terminal failure finalizer 链路

系统 SHALL 在 `/api/chat` trace 中记录 terminal failure finalizer 的触发、跳过、模型调用、输出校验、确定性降级和最终响应投影。该 trace MUST 能区分主 Agent 失败和 finalizer 成功回复，MUST NOT 把 finalizer 回复误记为主 Agent 成功。

#### Scenario: finalizer 被调用

- **WHEN** production adapter 调用 terminal failure finalizer
- **THEN** trace MUST 记录 finalizer trigger step
- **AND** step MUST 包含主 Agent failure code、failure category、repair budget 状态和 provider availability gate 结果
- **AND** step MUST 记录 finalizer prompt version、model、timeout、maxTokens 或等价配置摘要
- **AND** step MUST NOT 记录 API key、authorization、cookie、完整 prompt、完整 tool output 或跨用户 payload

#### Scenario: finalizer 输出成功

- **WHEN** terminal failure finalizer 返回合法输出
- **THEN** trace MUST 记录 finalizer model response 摘要
- **AND** trace MUST 记录 finalizer output validation success
- **AND** trace MUST 记录最终 response projection type 为 `terminal_failure_finalizer` 或等价类型
- **AND** trace final decision MUST 保留主 Agent 原始 failure code

### Requirement: Trace 必须记录 finalizer 跳过和降级原因

系统 SHALL 在 terminal failure finalizer 未被调用或调用失败时记录稳定跳过 / 降级原因，便于开发者区分 provider 不可用、配置关闭、输出无效、超时和不可分类失败。

#### Scenario: provider gate 跳过 finalizer

- **WHEN** provider availability gate 阻止 finalizer 调用
- **THEN** trace MUST 记录 `finalizerSkippedReason`
- **AND** reason MUST 使用稳定 code，例如 `provider_unavailable`、`provider_quota_exhausted`、`model_config_missing`、`finalizer_disabled`、`remaining_time_insufficient` 或等价 code
- **AND** trace MUST 记录最终使用确定性 fallback

#### Scenario: finalizer 输出无效

- **WHEN** finalizer 返回输出但 schema 或内容校验失败
- **THEN** trace MUST 记录 `finalizer_output_invalid` 或等价 code
- **AND** trace MUST 记录被拒绝字段的安全摘要
- **AND** trace MUST 记录系统已降级为确定性 fallback
- **AND** 用户可见响应 MUST NOT 包含被拒绝的 finalizer 原文

### Requirement: Trace 导出必须支持排查 finalizer 可见输入

系统 SHALL 让 `/dev/ai-traces` 导出能排查 finalizer 实际模型可见输入，同时继续执行长文本外置、脱敏和权限边界。

#### Scenario: 导出 finalizer 模型请求

- **WHEN** trace 包含 terminal failure finalizer 模型调用
- **THEN** trace 导出 MUST 包含 finalizer request 的安全摘要或 `contentRef`
- **AND** 导出 MUST 能显示 finalizer user message 中的 failure category、unmet requirements 和 verified facts 摘要
- **AND** 导出 MUST 能显示 finalizer system prompt version
- **AND** 导出 MUST NOT 显示未脱敏 secret、完整 provider body 或跨用户 payload

#### Scenario: 黑盒报告读取 finalizer 结果

- **WHEN** 手动 LLM 黑盒 runner 或报告消费 trace 摘要
- **THEN** 报告 MUST 能读取本轮是否进入 finalizer
- **AND** 报告 MUST 能读取 finalizer 是否成功、跳过或降级
- **AND** 报告 MUST 区分 `main_agent_completed`、`terminal_failure_finalizer` 和 `deterministic_fallback`

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

### Requirement: Trace 必须记录 AgentAction normalization 诊断
系统 SHALL 在 AgentAction 顶层字段被 type-aware normalization 丢弃时记录可复盘 trace 诊断。诊断 MUST 说明 selected action type、被丢弃字段路径和 normalized action 是否继续执行；诊断 MUST NOT 记录被丢弃字段的完整值、未经脱敏的大 payload、secret、跨用户事实或用户不可见内部 payload。

#### Scenario: tool_call 顶层 content 被丢弃
- **WHEN** Planner 返回 `type = "tool_call"` 的 action
- **AND** action 顶层包含不属于 `tool_call` allowlist 的 `content`
- **AND** Runtime 丢弃该字段并继续执行 normalized action
- **THEN** trace MUST 记录 action normalization 诊断
- **AND** 诊断 MUST 包含 selected action type `tool_call`
- **AND** 诊断 MUST 包含 dropped field path `content`
- **AND** 诊断 MUST 记录 normalized action 继续进入 validation / executor
- **AND** 诊断 MUST NOT 记录 `content` 的完整文本

#### Scenario: 多个顶层字段被丢弃
- **WHEN** Runtime 对一个合法 discriminator 的 AgentAction 丢弃多个不参与 selected variant 执行语义的顶层字段
- **THEN** trace MUST 记录所有被丢弃字段的 path
- **AND** trace MAY 记录字段类型、长度、hash 或脱敏摘要
- **AND** trace MUST NOT 将被丢弃字段标记为 tool input、terminal content、visible output、resource 或 usedRefs

#### Scenario: normalization 不掩盖真正 schema 失败
- **WHEN** Runtime 无法通过 normalization 得到可执行 AgentAction
- **THEN** trace MUST 继续记录 invalid action 或 schema validation failure
- **AND** trace MUST 能区分 normalized-and-executed、normalized-then-failed 和 not-normalizable 三类边界

### Requirement: Trace 必须记录 LangChain Agent 执行证据
系统 SHALL 为生产 `/api/chat` 的 LangChain Agent Runtime 记录可复盘 trace。trace MUST 记录请求上下文、模型请求/响应摘要、DeepSeek native `tool_calls`、LangChain tool wrapper 执行、结构化 validator 和最终 NDJSON 投影。

#### Scenario: LangChain run 开始
- **WHEN** `/api/chat` 进入 LangChain Agent Runtime
- **THEN** trace MUST 记录 runId、userId、conversationId、responseMessageId、latestUserMessage 摘要和 model / tool catalog 摘要
- **AND** trace MUST 记录 LangChain runtime version 或等价实现标识
- **AND** trace MUST 记录 DeepSeek model、tool calling enabled 状态、预算和超时配置摘要
- **AND** trace MUST NOT 记录 API key、authorization、cookie、跨用户 payload 或未经脱敏的大 payload

#### Scenario: DeepSeek 返回 tool calls
- **WHEN** DeepSeek 响应包含 native `tool_calls`
- **THEN** trace MUST 记录 tool call id、tool name、arguments 安全摘要、provider status 和关联 model call id
- **AND** trace MUST 能定位每个 tool call 对应的 LangChain tool wrapper 执行结果
- **AND** trace MUST NOT 将 provider tool call 记录为已成功执行业务结果，除非 wrapper 已完成并通过校验

#### Scenario: LangChain model call usage 和 Loop 关联
- **WHEN** LangChain Agent Runtime 完成或在一轮或多轮 model call 后失败
- **THEN** trace MUST 记录每次 LangChain model call 的请求摘要、响应摘要、modelCallIndex 和 runtimeStep
- **AND** trace MUST 在 provider 暴露 `usage_metadata` 或 `response_metadata.tokenUsage` 时记录 prompt、completion 和 total token usage
- **AND** trace MUST 通过 provider tool call id 将 DeepSeek `tool_calls` 与 LangChain tool wrapper 执行结果关联
- **AND** trace MUST 在 recursion / budget exhausted 等失败路径保留已捕获的 model calls、provider tool calls 和 tool wrapper executions

#### Scenario: LangChain tool wrapper 执行完成
- **WHEN** LangChain tool wrapper 成功、失败、被 policy 阻断或因 schema 拒绝而结束
- **THEN** trace MUST 记录 toolName、durationMs、input summary、output summary、failureCode、userId 隔离摘要和关键 resource id
- **AND** trace MUST 标记 tool result 是否进入后续模型上下文
- **AND** trace MUST NOT 保存完整敏感 handler output

#### Scenario: 终态响应投影完成
- **WHEN** production response adapter 输出 NDJSON 响应
- **THEN** trace MUST 记录输出事件类型摘要、content 长度、visible output 数量、suggestion 数量和错误 code
- **AND** trace MUST 能区分 LangChain 成功终态、结构化输出校验失败、tool wrapper 失败、provider 失败和配置失败

### Requirement: Trace 必须证明旧 Agent Core 缺席
系统 SHALL 在迁移后通过 trace 或架构扫描证明生产 `/api/chat` 未使用旧自研 Agent core。

#### Scenario: 生产聊天 trace 展示旧路径缺席
- **WHEN** trace 展示一次生产聊天请求
- **THEN** trace MUST 不再记录旧 `planner_action`、旧 `AgentAction`、旧 `ToolRegistry` manifest、旧 `runAgentRuntime` step 或旧 Response Renderer step
- **AND** trace SHOULD 记录 runtime family 为 LangChain 或等价标识

#### Scenario: 架构扫描验证旧 trace 字段缺席
- **WHEN** 本 change 完成实现
- **THEN** 自动化扫描 MUST 证明生产 trace 写入路径不再依赖旧 `AgentAction`、旧 `PlannerModelTraceEvent`、旧 `duplicate_tool_call` 或旧 resource refs 作为运行时合同

### Requirement: Trace 写入必须保持非致命
系统 SHALL 将 LangChain trace 观测视为开发诊断。trace 创建、step 写入、planner diagnostics 保存或摘要保存失败不得改变用户可见响应。

#### Scenario: trace step 写入失败
- **WHEN** model request、tool call、tool result 或 response projection trace 写入失败
- **THEN** `/api/chat` MUST 继续按 LangChain runtime 结果返回响应
- **AND** 系统 MUST 记录非致命开发诊断
- **AND** 系统 MUST NOT 因 trace 写入失败重试模型、重复执行 tool 或改写最终回答

### Requirement: LangChain AI trace 必须区分 tool 事实、duplicate feedback 和最终 validator
系统 SHALL 在 LangChain AI trace / trace summary 中记录可复盘的分层事实，使开发者能够区分 provider tool call、tool execution、tool result fact summary、duplicate input feedback、finalization / terminal validator 和 response projection。Trace MUST NOT 把中间 tool result 的候选数量、空结果、section 覆盖或 diagnostics 投影成业务成功 / 失败判定。

#### Scenario: trace 记录分层边界
- **WHEN** LangChain Agent run 执行 tool 并进入最终回答、finalization、repair 或 failure finalizer
- **THEN** trace MUST 区分 provider tool call 尝试、tool wrapper execution status、model-visible fact summary、duplicate input feedback、finalization / terminal validator result 和 response adapter projection
- **AND** trace MUST NOT 使用 `fulfillment.satisfied`、`satisfied=true`、`satisfied=false` 或等价字段表达用户目标是否完成
- **AND** trace MUST NOT 将 `totalMatches`、候选数量、空结果、`availableSections`、`missingSections` 或 diagnostics 汇总成业务成功 / 失败

#### Scenario: 0 条成功结果可复盘
- **WHEN** tool 成功执行并返回 0 条结果、空候选或空 `facts[]`
- **THEN** trace MUST 保留安全摘要说明该 tool 成功执行、结果为空和对应 query / filters / diagnostics 摘要
- **AND** 如果模型用该结果输出普通文本回答，trace MUST 将该 run 记录为合法 final response 或等价成功终态，而不是 repair failure
- **AND** 如果模型用该结果伪造结构化训练输出，trace MUST 将失败归因到 finalization tool、terminal output validator 或业务 validator，而不是 tool result 业务满足度

#### Scenario: duplicate input 命名不表达业务成功
- **WHEN** runtime 检测到相同 `toolName + toolVersion + normalizedInputHash` 重复调用
- **THEN** trace MUST 记录 `duplicate_tool_input`、`duplicate_input` 或等价中性事件
- **AND** trace MAY 包含重复次数、安全 input hash 和有限既有事实摘要
- **AND** trace MUST NOT 使用 `duplicate_tool_success`、`duplicate-success`、`success`、`satisfied` 或等价命名表达业务目标已经成功

### Requirement: Trace 导出必须携带 tool 输出可见性元数据
系统 SHALL 在保存全链路 log 时，为 LangChain tool execution 的模型可见摘要、用户投影和调试摘要提供稳定可见性元数据，使离线排查能判断每个区块是否进入模型上下文。

#### Scenario: 导出 tool execution 可见性边界
- **WHEN** 开发者在 `/dev/ai-traces` 保存包含 LangChain tool execution 的全链路 log
- **THEN** `codex_logs/ai_trace_log.js` 或对应 `detailRef` 详情 MUST 区分 `modelVisibleSummary`、`userProjection` 和 `traceSummary`
- **AND** `modelVisibleSummary` MUST 标注为 `llm_visible`、`modelVisible: true` 或等价语义
- **AND** `userProjection` MUST 标注为 `user_projection`、`modelVisible: false` 或等价语义
- **AND** `traceSummary` MUST 标注为 `debug_only`、`modelVisible: false` 或等价语义

#### Scenario: 导出候选数量诊断字段
- **WHEN** 导出报告或 `detailRef` 详情包含 `traceSummary.totalMatches`、`traceSummary.returnedCount`、`traceSummary.truncated` 或等价候选数量诊断字段
- **THEN** 对应字段或所属区块 MUST 标注为 debug-only / not model-visible
- **AND** 导出报告 MUST 保留这些字段用于数据库筛选、候选截断和 tool 执行排查
- **AND** 导出报告 MUST NOT 将这些字段复制到 `modelVisibleSummary` 或 LLM 可见区块中

#### Scenario: 导出 enteredModelContext 语义
- **WHEN** 导出报告展示 `enteredModelContext = true` 或等价状态
- **THEN** 报告 MUST 明确该状态表示 `modelVisibleSummary` 已回填模型
- **AND** 报告 MUST 明确 `userProjection` 和 `traceSummary` 不因该状态进入模型上下文
- **AND** 报告 MAY 保留原始字段名以兼容既有 trace，但默认摘要 MUST 使用精确语义说明

#### Scenario: 长文本和详情映射保留可见性
- **WHEN** `modelVisibleSummary`、`userProjection`、`traceSummary` 或包含这些字段的详情被替换为 `contentRef` 或 `detailRef`
- **THEN** header record MUST 保留可见性元数据或足够从路径推导的可见性说明
- **AND** chunk record MUST 能通过 `parentRef` 关联回带有可见性元数据的 header
- **AND** 导出层 MUST 继续执行现有脱敏、截断和大 payload 外置规则

