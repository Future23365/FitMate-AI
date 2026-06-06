# agent-text-chat-user-error-boundary Specification

## Purpose
TBD - created by archiving change stabilize-agent-text-chat-unsupported-response. Update Purpose after archive.
## Requirements
### Requirement: 用户可见聊天不得展示服务端内部错误

生产 `/api/chat` 文本聊天 SHALL 将服务端错误、runtime 错误、validator 错误、provider 错误和 stream 解析错误与用户可见助手文本分离。用户可见聊天气泡、全局聊天错误提示和建议回复 MUST NOT 原样展示服务端 `error.message`、runtime budget 文案、validator 名称、tool 注册状态、provider 原文、堆栈、内部英文错误或错误 details。

#### Scenario: Runtime terminal error is produced

- **WHEN** `runAgentRuntime()` 返回 `terminalError`
- **THEN** 用户可见 NDJSON 投影 MUST NOT 原样输出 `terminalError.message`
- **AND** 内部错误 code 和 details MAY 进入 trace、测试断言或开发态日志
- **AND** 前端最终 assistant message MUST NOT 包含该内部错误原文

#### Scenario: Frontend receives an error event

- **WHEN** chat client 收到 NDJSON `error` 事件
- **THEN** 前端 MUST NOT 把 `event.error.message` 原样写入 assistant message 或页面可见错误区域
- **AND** 前端 MAY 保留 `event.error.code`、`retryable` 或脱敏 details 作为内部状态或测试信息
- **AND** 用户可见文案 MUST 使用本地稳定中文兜底或后端提供的安全 `content` 事件

#### Scenario: HTTP or stream failure happens

- **WHEN** `/api/chat` HTTP 请求失败、NDJSON 解析失败、请求 abort 以外的 stream 错误发生，或模型 provider 返回不可恢复错误
- **THEN** 前端用户可见文案 MUST 使用稳定中文兜底
- **AND** 文案 MUST NOT 包含 HTTP body 原文、provider 错误原文、堆栈、API key 缺失字段或服务端内部错误 message

### Requirement: 当前不支持的 tool 能力必须投影为安全助手回复

生产 `/api/chat` 文本聊天 SHALL 在当前空 `ToolRegistry` 或 tool capability 不支持场景下，把模型明确请求不可执行 tool 的失败作为安全错误边界处理。该边界 MUST 防止内部错误、validator 文案和 runtime budget 细节进入用户气泡，但 MUST NOT 替代基础问答的正常模型回复，也 MUST NOT 使用服务端固定业务回答来解释用户自然语言问题。

#### Scenario: Empty registry rejects a generated tool call

- **WHEN** 当前生产文本聊天使用空 `ToolRegistry`
- **AND** Planner 返回 `tool_call`
- **AND** runtime 因 `unknown_tool`、`invalid_action`、`repair_limit_exceeded` 或等价不可执行错误收口
- **THEN** `/api/chat` MAY 输出普通 `content` 事件说明刚才请求的操作需要当前未接入的工具，无法直接执行
- **AND** 响应 MAY 输出 `assistant_suggestions` 引导用户改问普通文本问题、训练原则、动作说明或需要补充的信息
- **AND** 响应 MUST 输出 `done`
- **AND** 响应 MUST NOT 输出会被前端显示的内部 `error.message`
- **AND** 响应 MUST NOT 把该安全边界文案伪装成模型对基础问答的正常 `final_answer`
- **AND** 响应 MUST NOT 使用固定“生成、保存或执行训练计划”类业务文案替代用户问题的语义回答

#### Scenario: Unsupported fallback is based on runtime facts

- **WHEN** 系统决定输出 unsupported capability fallback
- **THEN** 该决策 MUST 基于 registry、tool capability、action validation、runtime error code 或 trace event 等确定性事实
- **AND** 系统 MUST NOT 基于用户原文关键词、正则、同义词表、短句模板或服务端自然语言意图判断来决定 fallback
- **AND** 系统 MUST NOT 因用户询问助手能力、基础聊天能力或普通可回答问题而直接输出 unsupported fallback

#### Scenario: Internal diagnosis remains available

- **WHEN** unsupported capability fallback 被输出给用户
- **THEN** trace、runtime result 或测试诊断 MUST 仍能定位原始错误 code、触发阶段和是否由空 registry / unsupported tool 导致
- **AND** 这些内部诊断 MUST NOT 被渲染成用户可见聊天文本
- **AND** trace MUST 能区分模型合法 `final_answer` 成功和服务端安全错误边界投影

### Requirement: 错误投影不得恢复旧链路或隐藏业务 tool

生产文本聊天错误投影 SHALL 保持当前阶段的空 registry 和 Agent core 合同边界。修复用户可见错误时 MUST NOT 注册 fixture tool、真实业务 tool、旧 AgentOrchestrator、旧 `AgentExecutionResult`、旧 Response Writer、旧 `assistant_action` 或服务端关键词分流。

#### Scenario: Unsupported response is implemented

- **WHEN** 实现当前不支持功能的安全回复
- **THEN** `/api/chat` MUST 继续通过 `agent-core` runtime 和当前 production text chat service 收口
- **AND** `/api/chat` MUST NOT 注册动作库、训练生成、artifact 保存、用户记忆或 fixture 工具
- **AND** core 中 MUST NOT 新增具体业务 toolName 分支

#### Scenario: Architecture scan runs

- **WHEN** 架构边界测试扫描 production chat entrypoint
- **THEN** 测试 MUST 证明没有旧 `agent-orchestrator`、旧兼容事件、fixture registry、真实业务 tool 注册或用户文本关键词路由回流

### Requirement: Terminal failure 必须投影为可恢复用户回复

生产 `/api/chat` 文本聊天 SHALL 将可分类的 Agent terminal failure 投影为用户可恢复的安全助手回复。用户可见聊天气泡、页面错误提示和建议回复 MUST NOT 展示“聊天生成失败，请稍后重试。”作为 terminal failure 的最终文案；系统 MUST 根据稳定错误事实输出更具体但不泄漏内部实现的中文说明。

#### Scenario: repair 耗尽来自 visible output 校验失败

- **WHEN** `runAgentRuntime()` 返回 `status = "failed"`
- **AND** `terminalError.code = "repair_limit_exceeded"` 或等价 repair budget 耗尽错误
- **AND** 最近 validation details 或 trace event 表明失败来自 `final_answer.visibleOutputs[]` 校验、terminal reference 或 resource coverage
- **THEN** production `/api/chat` MUST 输出用户安全 `content` 事件，说明本次没有生成通过校验的可靠结果
- **AND** 响应 SHOULD 输出 `assistant_suggestions` 引导用户缩小范围、补充约束、放宽条件或改问当前事实可支撑的问题
- **AND** 响应 MUST 输出 `done`
- **AND** 用户可见文本 MUST NOT 原样包含 `repair_limit_exceeded`、`terminal_reference_invalid`、validator message、stack 或内部 details

#### Scenario: 能力未接入失败

- **WHEN** runtime failure 可由 registry、tool capability、unknown tool、unsupported capability 或 max tool calls 等确定性事实归类为当前能力未接入
- **THEN** production `/api/chat` MAY 输出安全 `content` 事件说明当前还不能直接执行该操作
- **AND** 响应 MAY 输出 `assistant_suggestions` 引导用户改问普通训练问题、训练原则、动作说明或补充信息
- **AND** 响应 MUST NOT 承诺已执行未注册 tool、已生成训练卡片、已保存 artifact 或已查询不可见事实

#### Scenario: 服务不可用或传输失败

- **WHEN** 模型配置缺失、provider 不可用、HTTP 请求失败、NDJSON 解析失败、stream 失败或其他非 Agent terminal validation failure 发生
- **THEN** 前端或后端用户可见文案 MUST 使用稳定中文说明服务暂不可用、请求超时或响应不可读取
- **AND** 文案 MUST NOT 展示 provider 原文、HTTP body 原文、API key 字段、stack、内部英文错误或脱敏前 details
- **AND** 文案 MUST NOT 使用“聊天生成失败，请稍后重试。”作为唯一恢复建议

#### Scenario: fallback 决策不使用用户原文

- **WHEN** 系统决定 terminal failure 的用户可见 fallback 类别
- **THEN** 决策 MUST 只基于 runtime status、terminal error code、validation details、budget events、registry/tool capability、provider/config 状态或等价确定性事实
- **AND** 系统 MUST NOT 基于用户原文关键词、正则、同义词表、短句模板、历史摘要自然语言或具体 phrasing 选择 fallback 类别
- **AND** 系统 MUST NOT 基于具体业务 `toolName` 语义分支改写 Planner 的 action、toolName、payload.kind 或回复策略

#### Scenario: 内部诊断保留

- **WHEN** terminal failure 被投影为用户安全 `content` 或安全错误文案
- **THEN** trace、runtime result、测试断言或开发态日志 MUST 保留原始错误 code、失败阶段、repair budget 状态和脱敏 details
- **AND** trace MUST 能区分模型合法 `final_answer` 成功、unsupported capability fallback、visible output validation fallback 和 transport/config failure
- **AND** 这些内部诊断 MUST NOT 被渲染成用户可见聊天文本

### Requirement: 内部可分类 terminal failure 应优先生成可继续对话的失败回复

生产 `/api/chat` 文本聊天 SHALL 在主 Agent 内部 repair 或 terminal validation 耗尽后，优先将可分类失败收口为普通助手回复。若 provider availability gate 允许，系统 MUST 可以通过 terminal failure finalizer 生成该回复；若 finalizer 不可用或失败，系统 MUST 使用确定性安全 fallback。

#### Scenario: repair 耗尽后 finalizer 成功

- **WHEN** `runAgentRuntime()` 返回可分类内部 terminal failure
- **AND** production adapter 调用 terminal failure finalizer 成功
- **THEN** 用户可见响应 MUST 包含 `content`
- **AND** 响应 MAY 包含 `suggested_questions`
- **AND** 响应 MUST 包含 `done`
- **AND** 用户可见文案 MUST 明确本轮没有满足用户需求
- **AND** 用户可见文案 MUST NOT 展示 `repair_limit_exceeded`、validator 原文、stack、provider 原文或内部 details

#### Scenario: finalizer 不可用时确定性 fallback

- **WHEN** 主 Agent 返回可分类内部 terminal failure
- **AND** finalizer 被配置关闭、provider availability gate 拒绝、finalizer 超时或 finalizer 输出校验失败
- **THEN** production adapter MUST 输出确定性中文安全回复或安全错误边界
- **AND** 响应 MUST NOT 退回展示内部 `error.message`
- **AND** trace MUST 记录 finalizer 未使用或降级原因

### Requirement: provider / transport failure 不得伪装成内部校验失败

生产 `/api/chat` 文本聊天 SHALL 区分内部 Agent 校验失败和模型供应商 / 传输不可用失败。provider、配置、鉴权、quota、rate limit、HTTP、网络、stream 或 NDJSON 解析失败 MUST 走服务不可用或请求失败的安全文案，MUST NOT 再尝试 finalizer。

#### Scenario: 模型供应商 HTTP 失败

- **WHEN** 模型 adapter 或 planner diagnostics 显示 provider HTTP failure、quota、rate limit、billing、auth 或 network failure
- **THEN** production adapter MUST NOT 调用 terminal failure finalizer
- **AND** 用户可见文案 MUST 表达服务暂不可用、请求受限或稍后重试 / 缩小问题
- **AND** 用户可见文案 MUST NOT 声称模型已经分析了剩余失败信息

#### Scenario: stream 或前端解析失败

- **WHEN** 前端收到 HTTP error、NDJSON parse error、stream error 或非用户主动 abort 的传输失败
- **THEN** 前端 MUST 使用稳定中文安全文案
- **AND** 前端 MUST NOT 把该失败显示成 finalizer 生成的助手回复
- **AND** 前端 MUST NOT 原样展示 provider body、server stack 或内部英文 message

### Requirement: 错误边界不得削弱服务端确定性校验

生产 `/api/chat` 文本聊天 SHALL 继续拒绝和隐藏未通过服务端校验的业务输出。terminal failure finalizer 或确定性 fallback 只能生成文本说明和建议问题，MUST NOT 把无效业务结果重新包装成用户可见成功结果。

#### Scenario: 无效训练结果不展示

- **WHEN** 主 Agent 生成的 `visibleOutputs[]` 未通过 terminal output validator
- **AND** terminal failure finalizer 生成了用户可见回复
- **THEN** 前端 MUST 只展示 finalizer 的普通文本回复和建议问题
- **AND** 前端 MUST NOT 展示被拒绝的训练卡片
- **AND** 后端 MUST NOT 保存被拒绝的训练事实

#### Scenario: trace 保留内部失败证据

- **WHEN** terminal failure 被 finalizer 或确定性 fallback 投影为用户安全回复
- **THEN** trace MUST 保留主 Agent 的失败 code、失败阶段、repair budget 状态和脱敏 details
- **AND** trace MUST 记录最终用户响应来源是 `terminal_failure_finalizer`、`deterministic_terminal_failure_fallback` 或等价 projection type
- **AND** 这些内部诊断 MUST NOT 被渲染成用户可见聊天文本

### Requirement: failed / diagnostic tool result 不得支撑成功 final_answer
生产 `/api/chat` 文本聊天 SHALL 区分成功事实、失败事实和诊断事实。`failed` tool result、diagnostic resource、不可消费 resource、`satisfied=false` 结果或 terminal validation failure details MUST NOT 被模型用作成功 `final_answer` 的 grounding；这些事实只能用于恢复、澄清、阻断说明、repair 或 production fallback / finalizer。

#### Scenario: failed tool result 进入 Planner 可见输入
- **WHEN** 当前 run 已有 `failed` tool result、diagnostic resource、不可消费 resource 或 `satisfied=false` result
- **THEN** 模型可见 prompt / model input / repair feedback MUST 明确这些事实不能支撑成功 `final_answer`
- **AND** 模型可见内容 MUST 表达可选合法路径：继续当前可见且合法的 `tool_call`、返回 `ask_user`、进入 repair，或交由 production fallback / finalizer 收口
- **AND** 模型可见内容 MUST NOT 暗示模型可以用成功 `final_answer` 解释“已完成但失败”的业务结果

#### Scenario: failed tool 后解释失败
- **WHEN** 模型需要向用户解释 failed / diagnostic 事实
- **THEN** 模型 SHOULD 优先使用 `ask_user` 表达缺口、约束冲突、需要用户补充的信息或可恢复选择
- **AND** 如果当前目标仍可通过合法工具继续推进，模型 SHOULD 继续返回合法 `tool_call`
- **AND** 如果 runtime 已经不可恢复或 repair budget 已耗尽，用户可见回复 MUST 由 production terminal failure fallback / finalizer 生成
- **AND** 成功 `final_answer` MUST NOT 只引用 failed / diagnostic result、不可消费 resource 或 validation details

#### Scenario: ok=true 空结果仍可支撑普通事实解释
- **WHEN** tool result 是 `ok=true` 且 deterministic fulfillment 表示查询成功，但返回 0 条或候选不足
- **THEN** 模型可见合同 MAY 允许模型用 `final_answer.usedRefs` 引用该 satisfied tool result 来解释“没有找到”“当前条件不足”等普通事实
- **AND** 该普通文本解释 MUST NOT 伪装成结构化训练卡片、已生成 routine、已生成 plan、已保存 artifact 或已执行未注册能力
- **AND** tests MUST 区分 `ok=true` 空结果和 `failed` / diagnostic result 的终态能力

### Requirement: 不可执行请求必须按通用 action 顺序收口
生产文本聊天 SHALL 对不可执行请求使用通用 action 决策顺序，而不是服务端自然语言分流。系统 MUST 保持：可直接回答则 `final_answer`；缺必要信息则 `ask_user`；需要未注册能力则不得 `tool_call` 或承诺执行；已有事实不足则继续合法 tool、澄清、repair 或 fallback。

#### Scenario: 能力未注册但未发生 tool failure
- **WHEN** 用户请求需要当前 `tools[]` 未注册的能力
- **AND** Planner 尚未执行 failed tool result
- **THEN** 模型 MAY 返回 `final_answer` 说明当前能力边界和可行替代方向
- **AND** 该回复 MUST NOT 承诺已查询、已保存、已生成卡片、已执行训练或会在回复后继续内部执行
- **AND** `/api/chat`、Agent runtime 和 fallback MUST NOT 根据用户原文关键词、正则、同义词表或短句模板选择该回复

#### Scenario: 能力未注册导致 runtime failure
- **WHEN** Planner 输出未注册 tool、invalid action、unknown tool、capability unsupported 或 repair limit exceeded
- **THEN** production fallback MAY 输出安全用户可见回复
- **AND** fallback 决策 MUST 基于 registry、tool capability、action validation、runtime error code、validation details 或 trace event 等确定性事实
- **AND** fallback MUST NOT 基于用户原文、历史摘要自然语言、具体 phrasing 或业务 `toolName` 语义分支改写模型 action

#### Scenario: 基础问答不被 fallback 抢占
- **WHEN** 用户请求是普通可回答问题、能力说明、训练原则解释、总结整理或概念解释
- **THEN** 模型 SHOULD 能直接返回 `final_answer`
- **AND** 系统 MUST NOT 因未注册业务 tool、空结果历史、业务 output contract 存在或用户提到训练相关词而强行输出 unsupported capability fallback

### Requirement: failed / diagnostic 终态必须可审计
系统 SHALL 在 trace、runtime result 或测试中保留足够诊断，使开发者能区分成功 `final_answer`、`ask_user`、unsupported fallback、visible output validation fallback、provider / transport failure 和 failed tool repair。

#### Scenario: trace 区分失败收口来源
- **WHEN** terminal failure 被投影为用户安全 `content`、`ask_user` 或 fallback
- **THEN** trace MUST 能定位原始错误 code、失败阶段、repair budget 状态、最近 validation details 或 tool result 状态
- **AND** trace MUST 能区分模型合法 `final_answer` 成功和 production fallback 安全投影
- **AND** 用户可见文本 MUST NOT 展示 stack、provider 原文、validator 内部 message、secret、`repair_limit_exceeded`、`terminal_reference_invalid` 或内部 details

#### Scenario: tests 覆盖 failed 不能成功收口
- **WHEN** 自动化测试构造 failed / diagnostic tool result 或 terminal visible output validation failure
- **THEN** tests MUST 证明该事实不能作为成功 `final_answer` 的唯一 grounding
- **AND** tests MUST 覆盖合法恢复路径：继续 tool、`ask_user`、repair 或 production fallback

