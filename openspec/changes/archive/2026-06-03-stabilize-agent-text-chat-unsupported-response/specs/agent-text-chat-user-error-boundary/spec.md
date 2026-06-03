## ADDED Requirements

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

生产 `/api/chat` 文本聊天 SHALL 在当前空 `ToolRegistry` 或 tool capability 不支持场景下，把 tool call 不可执行、unknown tool、unsupported tool、invalid action repair limit 或 max tool calls 等确定性能力缺口投影为普通助手回复。该回复 MUST 说明当前暂不支持直接执行该功能，并引导用户继续提出当前可回答的问题。

#### Scenario: Empty registry rejects a generated tool call

- **WHEN** 当前生产文本聊天使用空 `ToolRegistry`
- **AND** Planner 返回 `tool_call`
- **AND** runtime 因 `unknown_tool`、`invalid_action`、`repair_limit_exceeded` 或等价不可执行错误收口
- **THEN** `/api/chat` MUST 输出普通 `content` 事件说明当前暂不支持执行该功能
- **AND** 响应 SHOULD 输出 `assistant_suggestions` 引导用户改问训练原则、动作说明、限制补充或其他当前文本问题
- **AND** 响应 MUST 输出 `done`
- **AND** 响应 MUST NOT 输出会被前端显示的内部 `error.message`

#### Scenario: Unsupported fallback is based on runtime facts

- **WHEN** 系统决定输出 unsupported capability fallback
- **THEN** 该决策 MUST 基于 registry、tool capability、action validation、runtime error code 或 trace event 等确定性事实
- **AND** 系统 MUST NOT 基于用户原文关键词、正则、同义词表、短句模板或服务端自然语言意图判断来决定 fallback

#### Scenario: Internal diagnosis remains available

- **WHEN** unsupported capability fallback 被输出给用户
- **THEN** trace、runtime result 或测试诊断 MUST 仍能定位原始错误 code、触发阶段和是否由空 registry / unsupported tool 导致
- **AND** 这些内部诊断 MUST NOT 被渲染成用户可见聊天文本

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
