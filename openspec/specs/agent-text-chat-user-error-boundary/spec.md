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

