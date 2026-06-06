## ADDED Requirements

### Requirement: DeepSeekModelAdapter 必须消费 thinkingEnabled 构造 Thinking 请求
系统 SHALL 将首页聊天请求中的 `thinkingEnabled` 传递到生产 `DeepSeekModelAdapter`，并映射为 DeepSeek Thinking Mode 请求参数。该映射 MUST 保持在供应商 adapter 或等价 provider request builder 边界内。

#### Scenario: 开启思考模式
- **WHEN** `/api/chat` 请求中 `thinkingEnabled` 为 `true` 或省略后被服务端默认视为开启
- **THEN** `DeepSeekModelAdapter` 构造的 DeepSeek 请求体 MUST 包含 `thinking.type = "enabled"`
- **AND** 请求体 MUST 包含集中配置指定的 `reasoning_effort`
- **AND** 模型可见 prompt 仍 MUST 要求输出合法 `AgentAction` JSON

#### Scenario: 关闭思考模式
- **WHEN** `/api/chat` 请求中 `thinkingEnabled` 为 `false`
- **THEN** `DeepSeekModelAdapter` 构造的 DeepSeek 请求体 MUST 包含 `thinking.type = "disabled"`
- **AND** adapter MUST NOT 因 DeepSeek 默认开启 Thinking Mode 而省略 disabled 请求参数

#### Scenario: Thinking Mode 不改变 AgentAction 合同
- **WHEN** Thinking Mode 开启或关闭
- **THEN** `LlmPlanner` 和 `runAgentRuntime` MUST 继续只消费 `AgentAction` candidate
- **AND** 允许的 action type MUST 仍为 `tool_call`、`final_answer`、`ask_user`
- **AND** 本 change MUST NOT 新增 DeepSeek 原生 `tools`、`tool_calls` 或 `role = "tool"` 协议作为生产工具调用合同

#### Scenario: agent-core 保持供应商无关
- **WHEN** 实现 Thinking Mode 请求映射
- **THEN** `agent-core` MUST NOT 导入 DeepSeek Thinking Mode 类型、DeepSeek request body、`reasoning_content` 或供应商响应结构
- **AND** Thinking Mode 专有字段 MUST 只存在于 provider adapter、配置、trace projection 或生产装配层

### Requirement: reasoning_content 必须作为受控诊断而非用户可见回复处理
系统 SHALL 支持读取 DeepSeek 响应中的 `reasoning_content`，但当前用户可见聊天响应 MUST NOT 展示原始 reasoning 内容。系统 MUST 保留后续受控展示 reasoning 的扩展边界。

#### Scenario: 响应解析保留 reasoning 诊断
- **WHEN** DeepSeek 响应包含 `reasoning_content`
- **THEN** adapter MUST 能识别该字段
- **AND** 解析 `AgentAction` 时 MUST 继续以模型正式 `content` 为准
- **AND** `reasoning_content` MUST NOT 被拼接进 `content` 或当作 `AgentAction` JSON 解析来源

#### Scenario: 当前不向前端展示 reasoning 原文
- **WHEN** `/api/chat` 返回用户可见 NDJSON
- **THEN** 系统 MUST NOT 新增展示原始 `reasoning_content` 的用户可见事件
- **AND** 系统 MUST NOT 将原始 `reasoning_content` 保存为 chat history 中的 assistant content
- **AND** 后续若要展示 reasoning MUST 通过独立 change 定义前端事件、存储、脱敏和关闭策略
