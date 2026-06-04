# agent-text-chat-flow Specification

## Purpose
TBD - created by archiving change connect-agent-text-chat-trace-log. Update Purpose after archive.
## Requirements
### Requirement: 文本聊天主链必须生成可诊断 trace
系统 SHALL 在 production `/api/chat` 文本聊天主链中为已认证且请求体验证通过的请求生成开发态 `AiTrace`。该 trace MUST 绑定当前用户，并记录本轮 `AgentRunInput`、runtime 结果和用户可见 NDJSON 响应摘要。

#### Scenario: 文本回答请求完成
- **WHEN** 已认证用户向 `/api/chat` 发送合法请求，并且 runtime 以 `final_answer` 完成
- **THEN** 系统 MUST 创建一条 route 为 `/api/chat` 的 trace
- **AND** trace MUST 包含当前 `userId`、`runId`、`conversationId`、`responseMessageId` 或等价 message id
- **AND** trace MUST 记录最终用户可见响应包含 `content` 和 `done` 事件
- **AND** 响应 MUST 继续使用原有 NDJSON 白名单事件协议

#### Scenario: 澄清请求完成
- **WHEN** runtime 以 `ask_user` 或等价需要用户输入的 terminal action 完成
- **THEN** trace MUST 记录 runtime 状态为需要用户输入或等价状态
- **AND** trace MUST 记录用户可见响应包含澄清文本和建议回复数量
- **AND** trace MUST NOT 将澄清问题伪装成已执行业务 tool 的结果

#### Scenario: 模型配置缺失
- **WHEN** 已认证且合法的 `/api/chat` 请求无法构造生产 `LlmPlanner` 所需配置
- **THEN** 系统 MUST 为该请求创建 failed trace
- **AND** trace MUST 记录稳定配置错误 code，例如 `chat_ai_not_configured`
- **AND** 响应 MUST 继续返回结构化错误事件和 `done` 事件
- **AND** 系统 MUST NOT 返回旧 `chat_ai_disabled` 作为正常路径

#### Scenario: runtime 合同失败
- **WHEN** runtime 因非法 action、未知 tool、预算耗尽、planner 失败或结构化 terminal error 失败
- **THEN** trace MUST 记录失败 code、runtime status 和最终错误响应摘要
- **AND** trace MUST 能区分配置错误、模型输出非法和 runtime 合同失败
- **AND** 系统 MUST NOT 通过 `/api/chat` 业务分支执行未知 tool

### Requirement: 文本聊天 trace 不得扩大当前业务能力
系统 SHALL 保持当前文本聊天阶段的受控 `ToolRegistry`、跨 run 事实恢复边界和通用 NDJSON 事件边界。新增 trace 写入 MUST NOT 注册额外业务 tool、恢复旧事件或引入服务端自然语言分流。

#### Scenario: trace 写入记录预算和事实桥摘要
- **WHEN** `/api/chat` 为文本聊天请求创建 trace
- **THEN** trace MUST 记录 production registry 摘要、toolCount、toolNames 或等价 manifestHash 证据
- **AND** trace SHOULD 记录本轮 Agent run 的 `maxToolCalls`、`maxPlannerCalls`、`maxSteps` 和预算事件
- **AND** 如本轮恢复了动作事实摘要，trace MUST 只记录安全摘要和引用 id
- **AND** trace MUST NOT 记录完整历史 payload、跨用户 payload、未展示内部候选或未经脱敏的大 payload

### Requirement: `/api/chat` 必须接入新 agent-core 文本聊天主链
系统 SHALL 使用新的 `agent-core` runtime 处理生产 `/api/chat` 的文本聊天请求，并输出 NDJSON 流式响应。该主链 MUST 复用服务端请求校验、当前用户身份和会话 hydration，但 MUST NOT 恢复旧 `AgentOrchestrator`、旧 `AgentExecutionResult`、旧 Response Writer 或旧兼容事件。

#### Scenario: 聊天请求进入文本 Agent 主链
- **WHEN** 已认证用户向 `/api/chat` 发送合法聊天请求
- **THEN** 系统 MUST 通过 `prepareChatRequest()` 或等价服务端流程归一化最新用户消息、会话 id、响应消息 id 和历史上下文
- **AND** 系统 MUST 构造 `AgentRunInput` 并调用新的 `runAgentRuntime()`
- **AND** 响应 MUST 使用 NDJSON stream 输出默认 Response Renderer 事件
- **AND** 系统 MUST NOT 返回 `chat_ai_disabled` 作为正常成功路径

#### Scenario: 聊天请求缺少模型配置
- **WHEN** `/api/chat` 无法构造生产 `LlmPlanner` 所需的 DeepSeek 配置
- **THEN** 系统 MUST 返回稳定的配置错误
- **AND** 错误 MUST 区分于模型输出非法、runtime 合同失败和旧 AI 运行时下线

### Requirement: LLM 只能通过 PlannerPort 产出 AgentAction
系统 SHALL 使用 `LlmPlanner` 和模型 adapter 作为生产文本聊天的 planner 边界。LLM 输出 MUST 先解析为 `AgentAction` candidate，并由 Action Validator 校验后才能进入终止投影或失败收口。

#### Scenario: 模型返回最终文本回答
- **WHEN** LLM 返回合法 `final_answer`
- **THEN** Runtime MUST 将其作为 terminal action 校验
- **AND** Response Renderer MUST 输出 `content` 事件
- **AND** LLM MUST NOT 直接生成 NDJSON event

#### Scenario: 模型返回澄清问题
- **WHEN** LLM 返回合法 `ask_user`
- **THEN** Runtime MUST 将其作为需要用户输入的 terminal action
- **AND** Response Renderer MUST 输出澄清问题的 `content` 事件
- **AND** 如存在建议回复，Response Renderer MUST 输出 `assistant_suggestions` 事件

#### Scenario: 模型输出非法 action
- **WHEN** LLM 返回无法解析、Schema 不合法或不被当前合同允许的 action
- **THEN** Runtime MUST 记录结构化错误并按 repair / failure 预算收口
- **AND** 服务端 MUST NOT 用用户原文关键词改写该 action

### Requirement: 默认 Response Renderer 必须输出聊天可消费的 NDJSON 事件
系统 SHALL 使用默认 Response Renderer 将 `AgentRunResult` 投影为前端可消费的 NDJSON 事件。用户可见事件 MUST 来自 runtime terminal action、tool result 的安全投影或结构化错误，不得由 LLM 直接生成。

#### Scenario: 文本回答流式输出
- **WHEN** Runtime 以 `final_answer` 结束
- **THEN** 响应 MUST 至少输出一个 `content` 事件和一个 `done` 事件
- **AND** `content` MUST 来自已校验 terminal action

#### Scenario: 错误流式输出
- **WHEN** Runtime 因模型输出非法、未知工具、预算耗尽或 planner 失败而结构化失败
- **THEN** 响应 MUST 输出 `error` 事件和 `done` 事件
- **AND** `error` 事件 MUST 使用脱敏后的错误信息

#### Scenario: 不输出旧兼容事件
- **WHEN** `/api/chat` 返回文本聊天 NDJSON
- **THEN** 响应 MUST NOT 输出旧 `assistant_action`、旧 `intent_resolved`、旧 `agent_execution_result` 或旧 card trigger 事件
- **AND** 前端 MUST NOT 依赖这些旧事件展示本轮文本回复

### Requirement: 前端聊天必须消费通用 NDJSON 文本事件
前端聊天客户端 SHALL 从 `/api/chat` 读取 NDJSON stream，并将通用事件投影到当前 assistant message。前端 MUST NOT 在本阶段根据用户文本或旧事件推断训练卡片、动作推荐或保存结果。

#### Scenario: 前端追加 content 到 assistant bubble
- **WHEN** chat client 收到一个或多个 `content` 事件
- **THEN** `use-chat-controller` MUST 将内容追加或写入当前 assistant message
- **AND** 请求完成后 MUST 清理 loading 状态

#### Scenario: 前端展示建议回复
- **WHEN** chat client 收到 `assistant_suggestions` 事件
- **THEN** 前端 MUST 将建议写入当前 assistant message 的建议回复字段
- **AND** 点击建议后仍按普通用户消息发送

#### Scenario: 前端处理流式错误
- **WHEN** chat client 收到 `error` 事件、HTTP 错误、NDJSON 解析错误、abort 或超时
- **THEN** 前端 MUST 显示明确错误信息
- **AND** 当前 assistant message MUST 不再保持 reasoning / loading 状态

### Requirement: 生产文本聊天不得引入业务语义分流
系统 SHALL 保持服务端语义边界：LLM 负责自然语言语义判断，服务端只校验结构、registry、权限、预算、资源引用和投影边界。生产文本聊天 MUST NOT 用关键词、正则、短句模板、同义词表或规则评分选择业务 tool 或改写模型 action。

#### Scenario: 用户请求具体训练业务
- **WHEN** 用户要求推荐动作、生成训练、修改计划或保存内容
- **THEN** 在无业务 tool 阶段，模型 MAY 返回文本说明或澄清问题
- **AND** 服务端 MUST NOT 基于用户原文选择或伪造业务 tool 执行结果
- **AND** 回复 MUST NOT 承诺已生成训练卡片、已保存 artifact 或已查询动作库，除非后续业务 tool 已在独立 change 中接入并执行成功

#### Scenario: 架构扫描验证无业务分支
- **WHEN** 本 change 完成实现
- **THEN** 自动化扫描 MUST 证明 `/api/chat`、聊天接入服务和 `agent-core` 中不存在具体业务 toolName 分支
- **AND** 扫描 MUST 证明生产注册入口没有注册 fixture tool 或真实业务 tool

### Requirement: 默认 Agent LLM prompt 必须声明健身助手业务边界
生产 `/api/chat` 文本聊天使用的默认 Agent LLM prompt SHALL 声明当前助手是 AI 健身助手。该 prompt MUST 将助手能力边界描述为围绕动作推荐、训练目标/限制整理、训练原则解释和训练计划编排提供帮助，但 MUST NOT 承诺执行当前未注册的业务 tool。

#### Scenario: Prompt 包含产品职责定位
- **WHEN** 默认 Agent LLM prompt 被构造成 system message
- **THEN** prompt MUST 使用中文说明当前助手是 AI 健身助手
- **AND** prompt MUST 说明服务方向包括动作推荐和训练计划编排
- **AND** prompt MUST 保留基于当前可见 `tools` 回答能力边界的要求
- **AND** prompt MUST NOT 包含具体业务 toolName、服务端关键词分流规则、动作库查询流程或训练计划保存流程

### Requirement: 默认 Agent LLM prompt 必须声明非医疗边界
生产 `/api/chat` 文本聊天使用的默认 Agent LLM prompt SHALL 明确非医疗边界。模型 MUST NOT 提供医疗诊断、治疗建议、伤病判断或康复处方；当用户请求医疗判断时，模型 MUST 通过合法 `final_answer` 或 `ask_user` 说明能力边界，并只围绕非医疗训练信息继续回答或澄清。

#### Scenario: Prompt 包含非医疗能力边界
- **WHEN** 默认 Agent LLM prompt 被构造成 system message
- **THEN** prompt MUST 禁止模型提供医疗诊断或治疗建议
- **AND** prompt MUST 禁止模型提供伤病判断或康复处方
- **AND** 服务端 MUST NOT 新增关键词、正则、同义词表、短句模板或规则评分来判断医疗意图
- **AND** 当前空 `ToolRegistry` 阶段 MUST NOT 因医疗边界注册任何隐藏 tool 或业务 tool

### Requirement: 文本聊天接入必须接入 Planner / ModelAdapter trace 观测
production `/api/chat` 文本聊天主链 SHALL 将 `LlmPlanner` 和 `ModelAdapter` 的安全观测写入当前用户的开发态 `AiTrace`。该接入 MUST 不改变用户可见 NDJSON 响应，也 MUST 不扩大当前空 `ToolRegistry` 业务能力。

#### Scenario: 文本回答包含模型调用 trace
- **WHEN** 已认证用户向 `/api/chat` 发送合法请求，并且 `LlmPlanner` 调用模型后以 `final_answer` 完成
- **THEN** 当前用户 trace MUST 包含对应的 `model_request` 和 `model_response` step
- **AND** trace MUST 包含传给模型的 messages 摘要、模型 raw output 摘要、parsed `final_answer`、token usage 和 runtime validation result
- **AND** 响应 MUST 继续只返回 `content` 和 `done` 等 NDJSON 白名单事件

#### Scenario: 模型要求未知 tool
- **WHEN** 空 `ToolRegistry` 阶段模型返回 `tool_call`
- **THEN** trace MUST 同时记录模型输出中的 action type / toolName、Action Validator 的拒绝 code、repair / budget 事件和最终用户可见响应摘要
- **AND** `/api/chat` MUST NOT 通过业务分支执行该 tool
- **AND** trace MUST NOT 将该 tool 描述成已经执行成功

#### Scenario: 模型配置缺失
- **WHEN** `/api/chat` 无法构造生产 `LlmPlanner` 所需配置
- **THEN** trace MUST 记录配置错误和最终错误响应摘要
- **AND** trace MAY 缺少 `model_request` / `model_response` step
- **AND** 页面 MUST 将失败边界显示为配置阶段，而不是模型调用阶段

### Requirement: 文本聊天 trace 观测必须保持非致命
生产文本聊天 SHALL 将 trace 观测视为开发诊断，任何 trace 创建、planner diagnostics 读取、step 写入或保存摘要失败都不得改变用户可见响应。

#### Scenario: planner diagnostics 写入失败
- **WHEN** `model_request` 或 `model_response` trace step 写入失败
- **THEN** `/api/chat` MUST 继续按 runtime 结果返回 NDJSON 响应
- **AND** 系统 MUST 记录非致命开发诊断
- **AND** Runtime MUST NOT 因 trace 写入失败重试模型或改写 action

#### Scenario: 模型响应解析失败
- **WHEN** ModelAdapter 收到 invalid JSON、invalid action schema、空 content 或 HTTP 错误
- **THEN** trace MUST 记录模型调用失败摘要和稳定 failure code
- **AND** runtime MUST 继续通过 Action Validator / repair budget / terminal error 合同收口
- **AND** 服务端 MUST NOT 使用用户原文关键词修正模型 action

### Requirement: 生产文本聊天必须使用受控业务 ToolRegistry
生产 `/api/chat` 文本聊天 SHALL 使用受控 production `ToolRegistry` 运行 Agent。该 registry 在本阶段只能注册已声明的低风险只读业务 tool，并继续通过 `LlmPlanner -> runAgentRuntime -> Action Validator -> Executor -> Response Renderer` 收口。

#### Scenario: 生产聊天注册动作查询和事实读取 tool
- **WHEN** 已认证用户向 `/api/chat` 发送合法聊天请求
- **THEN** 系统 MUST 为本轮 Agent run 构造 production `ToolRegistry`
- **AND** registry MUST 包含 `searchExerciseResources`
- **AND** registry MAY 包含本 change 声明的动作事实 read/import tool
- **AND** registry MUST NOT 包含 fixture tools、训练生成、保存 artifact、用户记忆、动作详情读取、routine / plan / patch 候选集合或其他未在 OpenSpec 中声明的业务 tool
- **AND** Planner 可见 manifest MUST 来自 `ToolRegistry.serializeForPlanner()` 或等价安全序列化入口

#### Scenario: 生产聊天恢复跨 run 动作事实摘要
- **WHEN** `/api/chat` 构造 AgentRunInput
- **THEN** 系统 MAY 恢复当前用户和当前会话可访问的最近动作事实轻量摘要
- **AND** 该摘要 MUST 只包含可引用 id、消息 id、事实类型、展示动作数量、少量展示动作摘要和结构化过滤摘要
- **AND** 需要完整事实时，Planner MUST 调用已注册 read/import tool
- **AND** `/api/chat` MUST NOT 从自然语言聊天摘要或 assistant 正文反向重建完整动作事实

#### Scenario: 生产聊天不通过关键词选择 tool
- **WHEN** 用户请求查询动作库、刷新上一批推荐、解释训练原则或进行普通文本交流
- **THEN** `/api/chat` MUST NOT 根据用户原文关键词、正则、同义词表或短句模板选择 `searchExerciseResources` 或动作事实 read/import tool
- **AND** 是否调用 tool MUST 由 LLM 基于当前可见 manifest 和轻量事实摘要输出合法 `tool_call` 决定
- **AND** Action Validator MUST 继续拒绝未知 toolName、非法 input 和非法 resource 引用

