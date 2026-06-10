## ADDED Requirements

### Requirement: `/api/chat` 必须接入 LangChain Agent 文本聊天主链
系统 SHALL 使用 LangChain Agent Runtime 处理生产 `/api/chat` 的文本聊天请求，并输出受控 NDJSON 响应。该主链 MUST 复用服务端请求校验、当前用户身份、conversation hydration 和 trace 记录，但 MUST NOT 恢复旧自研 `agent-core` 主链。

#### Scenario: 聊天请求进入 LangChain Agent 主链
- **WHEN** 已认证用户向 `/api/chat` 发送合法聊天请求
- **THEN** 系统 MUST 通过 `prepareChatRequest()` 或等价服务端流程归一化最新用户消息、会话 id、响应消息 id 和历史上下文
- **AND** 系统 MUST 构造 LangChain Agent Runtime 输入
- **AND** 系统 MUST 使用 DeepSeek native Tool Calling 运行 LangChain agent
- **AND** 响应 MUST 使用 NDJSON stream 输出 production response adapter 事件
- **AND** 系统 MUST NOT 调用旧 `runAgentRuntime()`、旧 `LlmPlanner`、旧 `ToolRegistry` 或旧 Response Renderer

#### Scenario: 已保存会话最后一条是同内容 user 时保持幂等
- **WHEN** `/api/chat` 请求携带 `conversationId` 和 `latestUserMessage`
- **AND** 服务端 hydration 恢复的 saved conversation 最后一条消息本身是同内容 `user`
- **THEN** `prepareChatRequest()` 或等价逻辑 MUST NOT 再追加一条相同 user 消息
- **AND** 模型可见 messages MUST NOT 因同一次用户输入出现相邻重复 user 消息

#### Scenario: assistant 已回复后的同文本 user turn 不得被吞掉
- **WHEN** `/api/chat` 请求携带 `conversationId` 和 `latestUserMessage`
- **AND** 服务端 hydration 恢复的 saved conversation 中最近一条 user 消息内容与 `latestUserMessage` 相同
- **AND** saved conversation 最后一条消息是 `assistant`
- **THEN** `prepareChatRequest()` 或等价逻辑 MUST 将 `latestUserMessage` 追加为新的 user turn
- **AND** 模型可见 messages 最后一条 MUST 是本次 user 消息

### Requirement: 文本聊天响应必须保持 NDJSON 白名单投影
系统 SHALL 将 LangChain run result 投影为前端可消费的 NDJSON 白名单事件。LLM、DeepSeek provider payload 和 LangChain tool raw output MUST NOT 直接进入前端响应。

#### Scenario: 文本回答流式输出
- **WHEN** LangChain agent 以普通文本回答完成
- **THEN** 响应 MUST 至少输出一个 `content` 事件和一个 `done` 事件
- **AND** `content` MUST 来自受控最终消息
- **AND** `done` MUST 标记本轮请求完成

#### Scenario: 建议回复输出
- **WHEN** LangChain run 或 response adapter 产生用户可直接发送的建议问题
- **THEN** 响应 MAY 输出 `assistant_suggestions` 事件
- **AND** 建议问题 MUST 是用户可见产品文案
- **AND** 建议问题 MUST NOT 包含 toolName、schema 字段、trace、provider payload 或内部错误详情

#### Scenario: 结构化业务输出
- **WHEN** LangChain run 产生通过 validator 的用户可见结构化输出
- **THEN** 响应 MAY 输出对应白名单 visible output 事件
- **AND** 结构化 payload MUST 已经通过服务端业务 validator
- **AND** 响应 MUST NOT 输出未校验模型 JSON

#### Scenario: 错误响应
- **WHEN** LangChain model 调用、tool wrapper、结构化 validator、配置或 response adapter 失败
- **THEN** 响应 MUST 输出安全错误 `content` 或 `error` 事件
- **AND** 响应 MUST 输出 `done`
- **AND** 用户可见事件 MUST NOT 原样包含 provider raw error、stack、validator 内部细节或 secret

### Requirement: 生产文本聊天不得引入服务端语义分流
系统 SHALL 保持服务端语义边界：LLM 负责自然语言语义判断，服务端只校验结构、registry、权限、预算、资源引用、数据库事实和投影边界。

#### Scenario: 用户请求具体训练业务
- **WHEN** 用户要求推荐动作、生成训练、修改计划、保存内容或引用历史结果
- **THEN** LangChain agent MAY 基于可见 tools 选择 native tool call、回答或澄清
- **AND** 服务端 MUST NOT 基于用户原文选择或伪造业务 tool 执行结果
- **AND** 回复 MUST NOT 承诺已生成训练卡片、已保存 artifact 或已查询动作库，除非对应 LangChain tool wrapper 已执行成功且结果通过服务端校验

#### Scenario: 架构扫描验证无业务分支
- **WHEN** 本 change 完成实现
- **THEN** 自动化扫描 MUST 证明 `/api/chat`、聊天接入服务和 LangChain runtime 中不存在基于用户原文关键词的业务分支
- **AND** 扫描 MUST 证明生产 tool catalog 没有注册 fixture tool 或未声明业务 tool

## REMOVED Requirements

### Requirement: `/api/chat` 必须接入新 agent-core 文本聊天主链
**Reason**: 生产主链将迁移到 LangChain Agent Runtime，不再接入项目自研 `agent-core`。

**Migration**: 使用 `LangChain Agent Runtime -> DeepSeek native tool_calls -> LangChain tool wrapper -> production response adapter` 替代。

### Requirement: LLM 只能通过 PlannerPort 产出 AgentAction
**Reason**: 模型不再通过旧 `PlannerPort` 输出 `AgentAction`。DeepSeek native Tool Calling 由 LangChain runtime 和 tool wrapper 处理。

**Migration**: 使用 LangChain model / tool calling contract、tool wrapper schema 校验和结构化终态 validator 替代旧 Action Validator。

### Requirement: 默认 Response Renderer 必须输出聊天可消费的 NDJSON 事件
**Reason**: 旧默认 Response Renderer 消费旧 `AgentRunResult`。新链路由 production response adapter 消费 LangChain run result。

**Migration**: 保留 NDJSON 外部响应合同，但内部投影源改为 LangChain run result、tool wrapper summary 和服务端 validator 结果。

### Requirement: 生产文本聊天必须使用受控业务 ToolRegistry
**Reason**: 旧 `ToolRegistry` 将被删除。生产工具集合由 LangChain production tool catalog 管理。

**Migration**: 使用 LangChain tool catalog 暴露已声明、已测试、满足权限和投影边界的业务 tools。
