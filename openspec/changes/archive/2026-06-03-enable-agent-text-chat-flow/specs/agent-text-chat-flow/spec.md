## ADDED Requirements

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

### Requirement: 文本聊天阶段必须使用空 ToolRegistry
系统 SHALL 在本阶段使用空 `ToolRegistry` 运行生产文本聊天。生产 `/api/chat` MUST NOT 注册 fixture tool、真实业务 tool、动作库查询、训练生成、保存、用户记忆或数据库业务查询工具。

#### Scenario: 模型可见工具清单为空
- **WHEN** `/api/chat` 启动文本聊天 run
- **THEN** 传给 Planner 的 tool manifest MUST 为空数组
- **AND** 系统 MUST NOT 注册 `readFixture`、M1 fixture tools、`searchExercises`、训练生成、保存、用户记忆或任何 `agent-tools/<domain>` 业务 tool

#### Scenario: 模型请求未知工具
- **WHEN** 模型在空 registry 阶段返回 `tool_call`
- **THEN** Action Validator MUST 拒绝该 action
- **AND** Runtime MUST 按 invalid action repair / failure 预算收口
- **AND** 系统 MUST NOT 在 `/api/chat` 中通过业务分支执行该 tool

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
