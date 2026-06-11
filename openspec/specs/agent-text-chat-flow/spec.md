# agent-text-chat-flow Specification

## Purpose
TBD - created by archiving change connect-agent-text-chat-trace-log. Update Purpose after archive.
## Requirements
### Requirement: 文本聊天主链必须生成可诊断 trace
系统 SHALL 在 production `/api/chat` 文本聊天主链中为已认证且请求体验证通过的请求生成开发态 `AiTrace`。该 trace MUST 绑定当前用户，并记录本轮 LangChain run 输入摘要、runtime 结果和用户可见 NDJSON 响应摘要。

#### Scenario: 文本回答请求完成
- **WHEN** 已认证用户向 `/api/chat` 发送合法请求，并且 LangChain runtime 以结构化最终回复完成
- **THEN** 系统 MUST 创建一条 route 为 `/api/chat` 的 trace
- **AND** trace MUST 包含当前 `userId`、`runId`、`conversationId`、`responseMessageId` 或等价 message id
- **AND** trace MUST 记录最终用户可见响应包含 `content` 和 `done` 事件
- **AND** 响应 MUST 继续使用原有 NDJSON 白名单事件协议

#### Scenario: 澄清请求完成
- **WHEN** LangChain runtime 输出带建议提问的结构化最终回复，或 terminal failure finalizer 输出可恢复说明
- **THEN** trace MUST 记录最终回复来源和建议回复数量
- **AND** trace MUST 记录用户可见响应包含澄清文本和建议回复数量
- **AND** trace MUST NOT 将澄清问题伪装成已执行业务 tool 的结果

#### Scenario: 模型配置缺失
- **WHEN** 已认证且合法的 `/api/chat` 请求无法构造生产 `ChatDeepSeek` 所需配置
- **THEN** 系统 MUST 为该请求创建 failed trace
- **AND** trace MUST 记录稳定配置错误 code，例如 `chat_ai_not_configured`
- **AND** 响应 MUST 继续返回结构化错误事件和 `done` 事件
- **AND** 系统 MUST NOT 返回旧 `chat_ai_disabled` 作为正常路径

#### Scenario: runtime 合同失败
- **WHEN** runtime 因 provider 失败、未知 tool、tool schema 拒绝、预算耗尽或结构化最终回复校验失败
- **THEN** trace MUST 记录失败 code、runtime status 和最终错误响应摘要
- **AND** trace MUST 能区分配置错误、模型输出非法和 runtime 合同失败
- **AND** 系统 MUST NOT 通过 `/api/chat` 业务分支执行未知 tool

### Requirement: 文本聊天 trace 不得扩大当前业务能力
系统 SHALL 保持当前文本聊天阶段的受控 LangChain tool catalog、跨 run 事实恢复边界和通用 NDJSON 事件边界。新增 trace 写入 MUST NOT 注册额外业务 tool、恢复旧事件或引入服务端自然语言分流。

#### Scenario: trace 写入记录预算和事实桥摘要
- **WHEN** `/api/chat` 为文本聊天请求创建 trace
- **THEN** trace MUST 记录 production LangChain tool catalog 摘要、toolCount、toolNames 或等价 catalogHash 证据
- **AND** trace SHOULD 记录本轮 Agent run 的 `maxToolCalls`、`maxIterations`、整体 timeout 和预算事件
- **AND** 如本轮恢复了动作事实摘要，trace MUST 只记录安全摘要和引用 id
- **AND** trace MUST NOT 记录完整历史 payload、跨用户 payload、未展示内部候选或未经脱敏的大 payload

### Requirement: `/api/chat` 必须接入 LangChain 文本聊天主链
系统 SHALL 使用 `lib/server/langchain-agent/*` 的 LangChain Agent Runtime 处理生产 `/api/chat` 的文本聊天请求，并输出 NDJSON 流式响应。该主链 MUST 复用服务端请求校验、当前用户身份和会话 hydration，但 MUST NOT 恢复旧 `AgentOrchestrator`、旧 `AgentAction` JSON、旧 `PlannerPort`、旧 `ToolRegistry`、旧 Response Writer 或旧兼容事件。

#### Scenario: 聊天请求进入文本 Agent 主链
- **WHEN** 已认证用户向 `/api/chat` 发送合法聊天请求
- **THEN** 系统 MUST 通过 `prepareChatRequest()` 或等价服务端流程归一化最新用户消息、会话 id、响应消息 id 和历史上下文
- **AND** 系统 MUST 构造 LangChain agent messages、生产 LangChain tool catalog，并调用 `runLangChainAgentRuntime()`
- **AND** 响应 MUST 使用 NDJSON stream 输出 production response adapter 事件
- **AND** 系统 MUST NOT 返回 `chat_ai_disabled` 作为正常成功路径

#### Scenario: 已保存会话最后一条是同内容 user 时保持幂等
- **WHEN** `/api/chat` 请求携带 `conversationId` 和 `latestUserMessage`
- **AND** 服务端 hydration 恢复的 saved conversation 最后一条消息本身是同内容 `user`
- **THEN** `prepareChatRequest()` MUST NOT 再追加一条相同 user 消息
- **AND** 模型可见 `run.messages` MUST NOT 因同一次用户输入出现相邻重复 user 消息

#### Scenario: assistant 已回复后的同文本 user turn 不得被吞掉
- **WHEN** `/api/chat` 请求携带 `conversationId` 和 `latestUserMessage`
- **AND** 服务端 hydration 恢复的 saved conversation 中最近一条 user 消息内容与 `latestUserMessage` 相同
- **AND** saved conversation 最后一条消息是 `assistant`
- **THEN** `prepareChatRequest()` MUST 将 `latestUserMessage` 追加为新的 user turn
- **AND** 模型可见 `run.messages` 最后一条 MUST 是本次 user 消息
- **AND** 系统 MUST NOT 因文本内容相同而把已完成上一轮对话当作当前请求

#### Scenario: 聊天请求缺少模型配置
- **WHEN** `/api/chat` 无法构造生产 `ChatDeepSeek` 所需的 DeepSeek 配置
- **THEN** 系统 MUST 返回稳定的配置错误
- **AND** 错误 MUST 区分于模型输出非法、runtime 合同失败和旧 AI 运行时下线

### Requirement: LLM 只能通过 provider tool_calls 和结构化终态输出表达动作
系统 SHALL 使用 LangChain Agent Runtime、`@langchain/deepseek` 和 DeepSeek native `tool_calls` 作为生产文本聊天的模型边界。LLM 调用业务能力 MUST 通过当前 LangChain tool catalog，最终成功回复 MUST 通过 `fitmate_final_response` 结构化终态工具，所有 tool input、tool output、visible output 和最终回复 MUST 经服务端 wrapper / validator / response adapter 校验后才能进入用户可见投影或失败收口。

#### Scenario: 模型返回最终文本回答
- **WHEN** LLM 返回合法 `fitmate_final_response`
- **THEN** Runtime MUST 将其作为结构化最终回复校验
- **AND** `content` MUST 作为用户可见文本来源
- **AND** production response adapter MUST 输出 `content` 事件
- **AND** LLM MUST NOT 直接生成 NDJSON event

#### Scenario: 模型返回澄清问题
- **WHEN** LLM 返回带 `suggestedQuestions` 的合法 `fitmate_final_response`
- **THEN** Runtime MUST 校验 `content` 与 `suggestedQuestions`
- **AND** `content` MUST 作为澄清、说明或普通回答的用户可见文本来源
- **AND** production response adapter MUST 输出 `content` 事件
- **AND** 如存在建议提问，production response adapter MUST 输出 `suggested_questions` 事件

#### Scenario: 模型输出非法 action
- **WHEN** LLM 返回无法解析、Schema 不合法或不被当前合同允许的 tool call / structured final response
- **THEN** Runtime MUST 记录结构化错误并按失败预算、terminal failure finalizer 或确定性 fallback 收口
- **AND** 服务端 MUST NOT 用用户原文关键词改写该 provider tool call 或最终回复
- **AND** 如果非法 action 使用旧同义字段，repair feedback MUST 指出当前统一字段形状

### Requirement: Production response adapter 必须输出聊天可消费的 NDJSON 事件
系统 SHALL 使用 production response adapter 将 `LangChainAgentRunResult` 投影为前端可消费的 NDJSON 事件。用户可见事件 MUST 来自结构化最终回复、已校验 visible output、production adapter 的安全 terminal failure 投影或结构化错误，不得由 LLM 直接生成。

#### Scenario: 文本回答流式输出
- **WHEN** Runtime 以合法结构化最终回复结束
- **THEN** 响应 MUST 至少输出一个 `content` 事件和一个 `done` 事件
- **AND** `content` MUST 来自已校验 `fitmate_final_response.content`

#### Scenario: 澄清问题流式输出
- **WHEN** Runtime 以带澄清或建议问题的结构化最终回复结束
- **THEN** 响应 MUST 至少输出一个 `content` 事件和一个 `done` 事件
- **AND** `content` MUST 来自已校验 `fitmate_final_response.content`
- **AND** response adapter MUST NOT 读取旧 `ask_user.question`

#### Scenario: 可恢复 terminal failure 流式输出
- **WHEN** Runtime 因 visible output validation、tool schema 拒绝、结构化最终回复校验失败、预算耗尽或等价 Agent terminal failure 而结构化失败
- **AND** production chat adapter 能基于稳定错误事实归类该失败
- **THEN** 响应 MAY 输出用户安全 `content` 事件和 `suggested_questions` 事件
- **AND** 响应 MUST 输出 `done` 事件
- **AND** 用户可见事件 MUST NOT 原样包含内部 `terminalError.message`、validator details、provider 原文或 stack
- **AND** trace MUST 记录该响应是 terminal failure fallback projection，而不是 runtime 成功的 structured final response

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
- **THEN** 自动化扫描 MUST 证明 `/api/chat`、聊天接入服务和 `langchain-agent` runtime / response adapter 中不存在具体业务 toolName 语义分支
- **AND** 扫描 MUST 证明生产注册入口没有注册 fixture tool 或未声明业务 tool

### Requirement: 默认 Agent LLM prompt 必须声明健身助手业务边界
生产 `/api/chat` 文本聊天使用的默认 Agent LLM prompt SHALL 声明当前助手是 AI 健身助手。该 prompt MUST 将助手能力边界描述为围绕动作推荐、训练目标/限制整理、训练原则解释和训练计划编排提供帮助，但 MUST NOT 承诺执行当前未注册的业务 tool。

#### Scenario: Prompt 包含产品职责定位
- **WHEN** 默认 Agent LLM prompt 被构造成 system message
- **THEN** prompt MUST 使用中文说明当前助手是 AI 健身助手
- **AND** prompt MUST 说明服务方向包括动作推荐和训练计划编排
- **AND** prompt MUST 保留基于当前可见 `tools` 回答能力边界的要求
- **AND** prompt MUST NOT 包含具体业务 toolName、服务端关键词分流规则、动作库查询流程或训练计划保存流程

### Requirement: 默认 Agent LLM prompt 必须声明非医疗边界
生产 `/api/chat` 文本聊天使用的默认 Agent LLM prompt SHALL 明确非医疗边界。模型 MUST NOT 提供医疗诊断、治疗建议、伤病判断或康复处方；当用户请求医疗判断时，模型 MUST 通过合法 structured final response 说明能力边界，并只围绕非医疗训练信息继续回答或澄清。

#### Scenario: Prompt 包含非医疗能力边界
- **WHEN** 默认 Agent LLM prompt 被构造成 system message
- **THEN** prompt MUST 禁止模型提供医疗诊断或治疗建议
- **AND** prompt MUST 禁止模型提供伤病判断或康复处方
- **AND** 服务端 MUST NOT 新增关键词、正则、同义词表、短句模板或规则评分来判断医疗意图
- **AND** 当前 LangChain tool catalog MUST NOT 因医疗边界注册任何隐藏 tool 或额外业务 tool

### Requirement: 文本聊天接入必须接入 LangChain model / tool trace 观测
production `/api/chat` 文本聊天主链 SHALL 将 LangChain model call middleware、DeepSeek native `tool_calls` 和 tool wrapper execution 的安全观测写入当前用户的开发态 `AiTrace`。该接入 MUST 不改变用户可见 NDJSON 响应，也 MUST 不扩大当前 LangChain tool catalog 业务能力。

#### Scenario: 文本回答包含模型调用 trace
- **WHEN** 已认证用户向 `/api/chat` 发送合法请求，并且 LangChain runtime 调用模型后以结构化最终回复完成
- **THEN** 当前用户 trace MUST 包含对应的 `model_request` 和 `model_response` step
- **AND** trace MUST 包含传给模型的 messages 摘要、模型 raw output 摘要、parsed structured final response、token usage 和 runtime validation result
- **AND** 响应 MUST 继续只返回 `content` 和 `done` 等 NDJSON 白名单事件

#### Scenario: 模型要求未知 tool
- **WHEN** 模型返回未知 provider tool call
- **THEN** trace MUST 同时记录 provider tool call / toolName、LangChain wrapper 或 runtime 的拒绝 code、budget 事件和最终用户可见响应摘要
- **AND** `/api/chat` MUST NOT 通过业务分支执行该 tool
- **AND** trace MUST NOT 将该 tool 描述成已经执行成功

#### Scenario: 模型配置缺失
- **WHEN** `/api/chat` 无法构造生产 LangChain DeepSeek model 所需配置
- **THEN** trace MUST 记录配置错误和最终错误响应摘要
- **AND** trace MAY 缺少 `model_request` / `model_response` step
- **AND** 页面 MUST 将失败边界显示为配置阶段，而不是模型调用阶段

### Requirement: 文本聊天 trace 观测必须保持非致命
生产文本聊天 SHALL 将 trace 观测视为开发诊断，任何 trace 创建、model call diagnostics 读取、step 写入或保存摘要失败都不得改变用户可见响应。

#### Scenario: model call diagnostics 写入失败
- **WHEN** `model_request` 或 `model_response` trace step 写入失败
- **THEN** `/api/chat` MUST 继续按 LangChain runtime 结果返回 NDJSON 响应
- **AND** 系统 MUST 记录非致命开发诊断
- **AND** Runtime MUST NOT 因 trace 写入失败重试模型或改写 action

#### Scenario: 模型响应解析失败
- **WHEN** LangChain model call 收到 invalid structured response、空 content 或 HTTP 错误
- **THEN** trace MUST 记录模型调用失败摘要和稳定 failure code
- **AND** runtime MUST 继续通过结构化失败、terminal failure finalizer 或确定性 fallback 收口
- **AND** 服务端 MUST NOT 使用用户原文关键词修正 provider tool call 或结构化最终回复

### Requirement: 生产文本聊天必须使用受控 LangChain tool catalog
生产 `/api/chat` 文本聊天 SHALL 使用受控 production LangChain tool catalog 运行 Agent。该 catalog 只能注册已声明的业务 tool，并继续通过 `LangChain Agent Runtime -> provider tool_calls -> executeLangChainToolWrapper -> production response adapter` 收口。

#### Scenario: 生产聊天注册动作查询和事实读取 tool
- **WHEN** 已认证用户向 `/api/chat` 发送合法聊天请求
- **THEN** 系统 MUST 为本轮 Agent run 构造 production LangChain tool catalog
- **AND** catalog MUST 包含 `inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions`、`searchExerciseResources` 和 `submitVisibleTrainingProposal`
- **AND** catalog MUST NOT 包含 fixture tools、训练保存、用户记忆、训练执行、动作详情读取、routine / plan / patch 候选集合或其他未在 OpenSpec 中声明的业务 tool
- **AND** 模型可见 tool definition MUST 来自 LangChain tool wrapper 的 name、description 和 schema

#### Scenario: 生产聊天恢复跨 run 动作事实摘要
- **WHEN** `/api/chat` 构造 LangChain agent messages
- **THEN** 系统 MAY 恢复当前用户和当前会话可访问的最近动作事实轻量摘要
- **AND** 该摘要 MUST 只包含可引用 id、消息 id、事实类型、展示动作数量、少量展示动作摘要和结构化过滤摘要
- **AND** 需要完整事实时，模型 MUST 通过已注册 LangChain tool 获取或提交受控事实
- **AND** `/api/chat` MUST NOT 从自然语言聊天摘要或 assistant 正文反向重建完整动作事实

#### Scenario: 生产聊天不通过关键词选择 tool
- **WHEN** 用户请求查询动作库、刷新上一批推荐、解释训练原则或进行普通文本交流
- **THEN** `/api/chat` MUST NOT 根据用户原文关键词、正则、同义词表或短句模板选择 `searchExerciseResources` 或动作事实 read/import tool
- **AND** 是否调用 tool MUST 由 LLM 基于当前可见 tool description / schema 和轻量事实摘要输出合法 provider `tool_calls` 决定
- **AND** LangChain tool wrapper MUST 继续拒绝未知 toolName、非法 input 和非法事实引用

### Requirement: 文本聊天 stream 必须支持用户安全 Agent 进度事件

生产 `/api/chat` 文本聊天 NDJSON stream SHALL 支持用户安全的 Agent 进度事件，例如 `agent_progress`。该事件只服务当前请求的聊天 UI 活动条，MUST NOT 替代 `content`、`visible_output`、`tool_result`、`confirmation_request`、`assistant_suggestions`、`error` 或 `done` 等最终用户事件。

#### Scenario: 进度事件来自当前 LangChain 生命周期
- **WHEN** production chat service 输出 Agent 进度事件
- **THEN** 事件 MUST 来自当前请求生命周期、runtime 观察点、已发生的 LangChain trace summary、tool 安全 UI definition 字段、稳定业务事实合同或等价服务端确定性事实
- **AND** 事件 MUST NOT 由 LLM 直接生成
- **AND** 事件 MUST NOT 基于用户原文、关键词、正则、同义词表或固定短句模板生成
- **AND** 事件 MUST NOT 影响 provider tool_calls、tool wrapper execution、visible output validator、terminal failure finalizer 或 response adapter 结果

#### Scenario: production adapter 不维护具体 toolName 活动映射
- **WHEN** production chat service 将 `tool_execution` runtime event 投影为 Agent 进度事件
- **THEN** service MUST 优先读取 tool definition 的安全 UI 字段，例如 `uiActivityStage`
- **AND** service MAY 使用稳定 resource contract 做 fallback
- **AND** service MUST NOT 维护 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions` 或其他具体业务 `toolName` 的活动阶段映射表
- **AND** 缺少 `uiActivityStage` 和 resource fallback 时 MUST 使用通用安全阶段，例如 `analyzing_request`

### Requirement: Agent runtime 进度观察必须是非致命只读扩展

系统 SHALL 将 Agent 进度观察作为当前 LangChain runtime / production chat service 的只读扩展处理。任何进度观察、阶段映射或 stream 写入失败都不得改变 runtime 的业务执行结果。

#### Scenario: 观察点失败不影响 runtime
- **WHEN** runtime 在记录 tool catalog、model call、provider tool call、tool execution、visible output validation 或 response projection 等生命周期事件时触发进度观察
- **AND** 观察回调或阶段映射抛出异常
- **THEN** runtime MUST 继续按原始 Agent 合同执行
- **AND** runtime MUST NOT 重试 model、重试 tool、改写 provider tool call、跳过 validator 或替换最终回复
- **AND** 系统 MAY 记录非致命开发诊断

#### Scenario: core 不包含业务阶段分支
- **WHEN** 实现 runtime 进度观察机制
- **THEN** LangChain runtime / production chat service MUST 只暴露通用生命周期事件或通用观察点
- **AND** LangChain runtime MUST NOT 包含 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions` 或其他具体业务 `toolName` 的 UI 阶段分支
- **AND** 业务 tool 如需提供更具体 UI 阶段，MUST 通过 tool 安全 metadata、projection 或 production adapter 的安全映射表达

#### Scenario: stream 写入失败安全收口
- **WHEN** production chat service 在写入 `agent_progress` 时遇到 stream 已关闭、请求 abort 或写入异常
- **THEN** 系统 MUST 按当前请求取消或错误边界安全收口
- **AND** 已完成的 runtime 结果 MUST 不因进度写入失败被改写成业务成功或业务失败
- **AND** 用户可见错误 MUST 继续使用当前安全中文错误边界

### Requirement: 文本聊天 stream 必须拆分 LangChain 运行轮次和 Activity 事件

生产 `/api/chat` 文本聊天 NDJSON stream SHALL 使用独立事件表达后端 LangChain model/tool 运行轮次和当前活动阶段。轮次事件 MUST 只表示当前请求内真实 LangChain model/tool cycle；Activity 事件 MUST 只表示当前可展示活动阶段，两者不得互相推断或绑定为同一个状态字段。

#### Scenario: 进入后端 LangChain model/tool cycle 时发送轮次事件
- **WHEN** 当前 LangChain runtime 进入一次新的 model/tool cycle
- **THEN** stream MUST 发送 `agent_loop` 或等价白名单事件
- **AND** 事件 payload MUST 包含当前请求内从 1 开始的正整数 `loopTurn`
- **AND** 同一请求内只有进入新的后端 LangChain model/tool cycle 才能递增 `loopTurn`
- **AND** 事件 payload MUST NOT 包含 stage、toolName、tool input、tool output、resource id、prompt、raw model output、token usage 或 trace 详情

#### Scenario: 同一 Loop 内 Activity 更新不改变轮次
- **WHEN** 当前 LangChain model/tool cycle 内发生 model call、tool execution、validation、fact handling、finalizing 或等价运行阶段变化
- **THEN** stream MAY 发送 `agent_progress` 或等价 Activity 事件
- **AND** Activity 事件 MUST 表达 stage/status/messageKey/sequence 或等价 UI 安全字段
- **AND** Activity 事件 MUST NOT 让前端将 `loopTurn` 递增
- **AND** Activity 事件 MUST NOT 要求每个 stage 都绑定一个 Loop 轮次字段

#### Scenario: 不同 Loop 可以重复相同 Activity 阶段
- **WHEN** 后端连续两个 LangChain model/tool cycle 都执行同类 tool 或同类运行阶段
- **THEN** stream MUST 能表达新的 `agent_loop` 轮次
- **AND** stream MAY 在新轮次内再次发送相同 stage 的 Activity 事件
- **AND** 系统 MUST NOT 因 stage 文案重复而抑制真实 Loop 轮次变化

#### Scenario: 进入 Loop 前只发送准备阶段
- **WHEN** `/api/chat` 已完成请求校验、上下文准备或 LangChain agent messages 构造，但尚未进入后端 LangChain model/tool cycle
- **THEN** stream MAY 发送 Activity 事件表达准备阶段
- **AND** stream MUST NOT 发送虚假的 `agent_loop` 轮次
- **AND** 前端 MUST 能在没有 Loop 轮次时展示安全活动文案

#### Scenario: Loop 与 Activity 事件均来自服务端确定性生命周期
- **WHEN** production chat service 输出 `agent_loop` 或 Activity 事件
- **THEN** 事件 MUST 来自当前请求生命周期、runtime 观察点、已发生的 LangChain trace summary、tool 安全 UI metadata 或等价服务端确定性事实
- **AND** 事件 MUST NOT 由 LLM 直接生成
- **AND** 事件 MUST NOT 基于用户原文、关键词、正则、同义词表、固定短句模板或具体业务 `toolName` 特判生成
- **AND** 事件生成失败 MUST 被视为非致命 UI 诊断，不得改变 model call、tool execution、validator、terminal failure finalizer 或 response adapter 结果

### Requirement: LangChain structured final response 必须统一使用 suggestedQuestions
生产文本聊天的 `fitmate_final_response` 和 terminal failure finalizer 输出 SHALL 使用 `suggestedQuestions` 表达用户可见建议提问。成功回复和失败兜底 MUST 使用同一个字段名和同一套结构约束，避免把最终回答建议、澄清选项和前端按钮拆成多套字段。

#### Scenario: structured final response 输出建议提问
- **WHEN** LLM 返回合法 `fitmate_final_response`
- **AND** 该回答存在自然的下一步建议提问
- **THEN** structured final response MAY 包含 `suggestedQuestions`
- **AND** `suggestedQuestions` MUST 是最多 3 条字符串的数组
- **AND** 每条字符串 MUST 能作为下一轮用户消息直接发送

#### Scenario: terminal failure finalizer 输出建议提问
- **WHEN** terminal failure finalizer 返回合法输出
- **AND** 失败解释存在可点击的下一步候选
- **THEN** finalizer output MAY 包含 `suggestedQuestions`
- **AND** production response adapter MUST 将这些建议提问与失败说明一起投影给前端
- **AND** finalizer output MUST NOT 使用另一套 `suggestions` 字段表达相同语义

#### Scenario: 旧终态字段不进入新链路
- **WHEN** 实现阶段清理 `final_answer.assistantSuggestions`、旧 `ask_user.suggestions` 或等价历史字段
- **THEN** 新 structured final response schema、模型输出示例、测试 fixture 和 trace 断言 MUST 使用 `suggestedQuestions`
- **AND** 系统 MUST NOT 将旧终态字段归一化为 `suggestedQuestions`
- **AND** 系统 MUST NOT 因历史字段存在而在新生产路径继续保留旧字段名

### Requirement: 文本聊天 stream 必须输出 suggested_questions 事件
Production response adapter SHALL 将已校验的 `suggestedQuestions` 投影为统一 NDJSON 事件。该事件只承载用户可见建议提问文本，前端点击后仍按普通用户消息发送。

#### Scenario: Response adapter 输出 suggested_questions
- **WHEN** Runtime 以包含 `suggestedQuestions` 的 structured final response 或 finalizer output 结束
- **THEN** response adapter MUST 输出 `suggested_questions` 事件
- **AND** 事件 payload MUST 包含 `suggestedQuestions`
- **AND** `suggestedQuestions` MUST 保持 structured final response 或 finalizer output 中已校验的字符串数组语义
- **AND** response adapter MUST NOT 让 LLM 直接生成 NDJSON event

#### Scenario: 前端消费 suggested_questions
- **WHEN** chat client 收到 `suggested_questions` 事件
- **THEN** 前端 MUST 将 `suggestedQuestions` 写入当前 assistant message 的 `suggestedQuestions` 字段
- **AND** 前端 MUST 将每条建议提问渲染为可点击按钮
- **AND** 点击按钮后 MUST 按普通用户消息发送该字符串
- **AND** 前端 MUST NOT 根据按钮文案推断业务 action、toolName 或保存操作

#### Scenario: assistant_suggestions 不作为新建议提问事件
- **WHEN** 实现本 change 后 `/api/chat` 输出建议提问
- **THEN** 新 response adapter 测试 MUST 断言主路径输出 `suggested_questions`
- **AND** 新 chat client 主路径 MUST NOT 依赖旧 `assistant_suggestions` 事件展示建议提问
- **AND** 新前端消息状态 MUST NOT 因旧 `assistant_suggestions` 事件生成 `suggestedQuestions`

### Requirement: 文本聊天流必须支持 terminal failure finalizer 响应

系统 SHALL 允许 production chat adapter 将 terminal failure finalizer 的合法输出投影为标准 NDJSON 聊天事件。该响应 MUST 与普通 assistant 文本消息兼容，但 MUST 在 trace 和响应摘要中标记为失败收口，不得标记为主 Agent 成功完成。

#### Scenario: finalizer 输出 NDJSON

- **WHEN** terminal failure finalizer 返回合法 `content` 和可选 `suggestedQuestions`
- **THEN** `/api/chat` MUST 输出 `content` 事件
- **AND** 如存在建议问题，`/api/chat` MUST 输出 `suggested_questions` 事件
- **AND** `/api/chat` MUST 输出 `done` 事件
- **AND** `/api/chat` MUST NOT 输出 `error` 事件作为该失败的用户可见主结果
- **AND** `/api/chat` MUST NOT 输出被拒绝的 `visible_output`、旧 `assistant_action`、旧 `intent_resolved` 或旧 card trigger

#### Scenario: finalizer 响应不是主 Agent structured final response

- **WHEN** `/api/chat` 输出 terminal failure finalizer 响应
- **THEN** 响应摘要 MUST 将 `projectionType` 记录为 `terminal_failure_finalizer` 或等价类型
- **AND** trace final decision MUST 保留主 Agent failure code
- **AND** trace MUST NOT 将该响应记录为主 Agent structured final response success

### Requirement: finalizer 阶段不得影响 stream 进度和加载状态

生产文本聊天 SHALL 在 finalizer 阶段继续输出前端可消费的终态事件，并保证前端加载、reasoning 和活动状态可以正常结束。finalizer 失败时 MUST 仍输出 `done` 或等价结束事件。

#### Scenario: finalizer 成功结束当前 assistant message

- **WHEN** 前端收到 terminal failure finalizer 产生的 `content`、可选 `suggested_questions` 和 `done`
- **THEN** 当前 assistant message MUST 结束 loading 状态
- **AND** 当前 assistant message MAY 展示建议问题
- **AND** 前端 MUST NOT 展示页面级错误提示替代该 assistant 回复

#### Scenario: finalizer 降级仍结束 stream

- **WHEN** finalizer 超时、输出无效或 provider availability gate 拒绝
- **THEN** `/api/chat` MUST 输出确定性 fallback 的终态事件
- **AND** 响应 MUST 包含 `done` 或等价流结束信号
- **AND** 前端 MUST 清理当前请求 loading / reasoning 状态

### Requirement: finalizer 不得恢复旧聊天事件协议

系统 SHALL 继续使用当前 NDJSON 白名单事件协议。terminal failure finalizer 的加入 MUST NOT 恢复旧 `assistant_action`、旧 `intent_resolved`、旧 `agent_execution_result`、旧 card trigger 或前端正文 trigger。

#### Scenario: finalizer 响应只使用白名单事件

- **WHEN** `/api/chat` 返回 terminal failure finalizer 响应
- **THEN** 响应事件类型 MUST 限定为当前白名单中的 `agent_progress`、`agent_loop`、`content`、`suggested_questions`、`done` 或等价安全事件
- **AND** 响应 MUST NOT 输出旧兼容事件
- **AND** 前端 MUST NOT 根据 finalizer 正文推断训练卡片、保存结果或业务 action

### Requirement: 文本聊天 stream 必须投影已校验活动摘要
生产 `/api/chat` 文本聊天 stream MAY 支持在 `agent_progress` 事件中携带可选 `activitySummary` 字段。当前 LangChain 主链中该字段 MUST 只来自服务端确定性阶段或已校验的用户安全摘要，LLM MUST NOT 直接生成 NDJSON event，也不得恢复旧 `AgentAction.activitySummary` 合同。

#### Scenario: action 摘要通过服务端投影进入 stream
- **WHEN** runtime 或 production chat service 产生用户安全活动摘要
- **AND** 该摘要已通过服务端安全边界检查
- **AND** 服务端判定该摘要适合用户展示
- **THEN** `/api/chat` MAY 输出一个 `agent_progress` 事件携带该 `activitySummary`
- **AND** 事件 MUST 继续包含合法 `stage`、`status` 和 `sequence`
- **AND** 事件 SHOULD 保留 `messageKey` 或等价 fallback 信息

#### Scenario: agent_loop 仍先表达轮次
- **WHEN** runtime 进入一次新的 Agent loop
- **THEN** `/api/chat` MUST 继续先输出合法 `agent_loop` 事件表达 `loopTurn`
- **AND** 系统 MUST NOT 要求 `agent_loop` 包含模型尚未生成的 `activitySummary`
- **AND** 同一 loop 中后续安全摘要 MAY 通过 `agent_progress` 更新活动条文案

#### Scenario: 非安全摘要降级为固定 stage
- **WHEN** action 中的 `activitySummary` 缺失、为空、过长、类型不合法或包含内部实现细节
- **THEN** `/api/chat` MUST NOT 将该摘要原样写入 NDJSON stream
- **AND** stream MUST 继续使用现有 `AgentProgressStage` / `messageKey` fallback
- **AND** 非安全摘要 MUST NOT 造成主 Agent run 失败，除非它来自必须拒绝的结构化输出字段

#### Scenario: activitySummary 不进入最终响应事实
- **WHEN** `/api/chat` 将 runtime 结果投影为 `content`、`visible_output`、`suggested_questions`、`tool_result`、`confirmation_request`、`error` 或 `done`
- **THEN** `activitySummary` MUST NOT 被写入这些终态事件的业务 payload
- **AND** `activitySummary` MUST NOT 进入 replay summary、conversation summary、visible output、artifact payload 或跨 run 事实恢复

### Requirement: 文本聊天 trace 必须安全记录活动摘要边界
生产 `/api/chat` trace SHALL 能诊断模型是否提供活动摘要以及服务端是否投影该摘要，但 trace MUST NOT 因该诊断扩大泄漏面或改变用户可见响应。

#### Scenario: trace 记录已采用摘要
- **WHEN** 服务端从合法 action 投影 `activitySummary`
- **THEN** trace MAY 在 runtime event summary 或 NDJSON 响应摘要中记录已采用的安全摘要
- **AND** trace MUST 记录该摘要来自服务端安全投影，而不是 LLM 直接生成的 stream event
- **AND** trace 写入失败 MUST NOT 改变 NDJSON 响应

#### Scenario: trace 不记录被拒绝原文
- **WHEN** `activitySummary` 因安全校验未被投影
- **THEN** trace MAY 记录稳定拒绝原因或计数
- **AND** trace MUST NOT 保存未脱敏的长摘要、内部 raw model response、provider 原文或不安全内部字段
