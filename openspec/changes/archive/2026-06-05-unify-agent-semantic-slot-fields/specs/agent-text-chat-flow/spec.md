## MODIFIED Requirements

### Requirement: LLM 只能通过 PlannerPort 产出 AgentAction
系统 SHALL 使用 `LlmPlanner` 和模型 adapter 作为生产文本聊天的 planner 边界。LLM 输出 MUST 先解析为 `AgentAction` candidate，并由 Action Validator 校验后才能进入终止投影或失败收口。LLM MUST 使用当前统一字段合同输出 terminal action。

#### Scenario: 模型返回最终文本回答
- **WHEN** LLM 返回合法 `final_answer`
- **THEN** Runtime MUST 将其作为 terminal action 校验
- **AND** `final_answer.content` MUST 作为用户可见文本来源
- **AND** Response Renderer MUST 输出 `content` 事件
- **AND** LLM MUST NOT 直接生成 NDJSON event

#### Scenario: 模型返回澄清问题
- **WHEN** LLM 返回合法 `ask_user`
- **THEN** Runtime MUST 将其作为需要用户输入的 terminal action
- **AND** `ask_user.content` MUST 作为澄清问题的用户可见文本来源
- **AND** Response Renderer MUST 输出 `content` 事件
- **AND** 如存在建议提问，Response Renderer MUST 输出 `suggested_questions` 事件
- **AND** LLM MUST NOT 输出 `ask_user.question`

#### Scenario: 模型输出非法 action
- **WHEN** LLM 返回无法解析、Schema 不合法或不被当前合同允许的 action
- **THEN** Runtime MUST 记录结构化错误并按 repair / failure 预算收口
- **AND** 服务端 MUST NOT 用用户原文关键词改写该 action
- **AND** 如果非法 action 使用旧同义字段，repair feedback MUST 指出当前统一字段形状

### Requirement: 默认 Response Renderer 必须输出聊天可消费的 NDJSON 事件
系统 SHALL 使用默认 Response Renderer 或 production chat adapter 将 `AgentRunResult` 投影为前端可消费的 NDJSON 事件。用户可见事件 MUST 来自 runtime terminal action、tool result 的安全投影、production adapter 的安全 terminal failure 投影或结构化错误，不得由 LLM 直接生成。

#### Scenario: 文本回答流式输出
- **WHEN** Runtime 以 `final_answer` 结束
- **THEN** 响应 MUST 至少输出一个 `content` 事件和一个 `done` 事件
- **AND** `content` MUST 来自已校验 `final_answer.content`

#### Scenario: 澄清问题流式输出
- **WHEN** Runtime 以 `ask_user` 结束
- **THEN** 响应 MUST 至少输出一个 `content` 事件和一个 `done` 事件
- **AND** `content` MUST 来自已校验 `ask_user.content`
- **AND** renderer MUST NOT 读取 `ask_user.question`

#### Scenario: 可恢复 terminal failure 流式输出
- **WHEN** Runtime 因 terminal output validation、terminal reference、repair budget 耗尽、预算耗尽或等价 Agent terminal failure 而结构化失败
- **AND** production chat adapter 能基于稳定错误事实归类该失败
- **THEN** 响应 MAY 输出用户安全 `content` 事件和 `suggested_questions` 事件
- **AND** 响应 MUST 输出 `done` 事件
- **AND** 用户可见事件 MUST NOT 原样包含内部 `terminalError.message`、validator details、provider 原文或 stack
- **AND** trace MUST 记录该响应是 terminal failure fallback projection，而不是 runtime 成功的 `final_answer`
