## ADDED Requirements

### Requirement: 建议提问必须统一为 suggestedQuestions
系统 SHALL 使用 `suggestedQuestions` 表达聊天主链用户可见建议提问。每条建议提问 SHALL 是用户点击后可以直接发送的完整用户消息；前端 SHALL 展示同一段文本作为按钮文案。

#### Scenario: 服务端输出建议提问
- **WHEN** 本轮聊天产生一个或多个用户可见建议提问
- **THEN** 服务端 MUST 输出 `suggestedQuestions`
- **AND** 每条建议提问 MUST 是非空字符串
- **AND** 建议提问数量 MUST 不超过 3 条
- **AND** 前端 MUST 能用该字段渲染建议按钮

#### Scenario: 建议提问点击后发送原文本
- **WHEN** 用户点击一条建议提问按钮
- **THEN** 前端 MUST 将该条 `suggestedQuestions` 文本作为下一轮用户消息发送
- **AND** 前端 MUST NOT 使用另一个 hidden message、label、targetOperation 或内部 action 替代该文本

#### Scenario: 旧建议字段归一到 suggestedQuestions
- **WHEN** 历史消息、旧 stream 或迁移期服务端结果仍包含 `assistantSuggestions`、`suggestedReplies`、`suggestions` 或旧 `assistant_suggestions`
- **THEN** 系统 MAY 将可直接发送的字符串建议归一化为 `suggestedQuestions`
- **AND** 归一化后 MUST 去重并限制最多 3 条
- **AND** 新生产写入路径 MUST 使用 `suggestedQuestions`

### Requirement: 建议提问不得成为服务端语义分流入口
系统 SHALL 将 `suggestedQuestions` 视为下一轮普通用户消息候选。服务端 MUST NOT 根据建议提问文本提前选择业务 tool、改写 action、执行保存或推断训练结构。

#### Scenario: 服务端不读取按钮文案执行操作
- **WHEN** 用户点击建议提问后发送下一轮消息
- **THEN** 该消息 MUST 进入普通聊天请求链路
- **AND** LLM MUST 基于本轮可见上下文重新判断语义
- **AND** 服务端 MUST NOT 因消息来自建议按钮而绕过 AgentAction、tool schema、ResourceStore、Policy Guard 或 validator

#### Scenario: 建议提问不承诺未执行结果
- **WHEN** 模型输出 `suggestedQuestions`
- **THEN** 每条建议提问 MUST NOT 声称某个 tool 已执行、某个训练已保存、某个 artifact 已验证或某个医疗结论已成立
- **AND** 如果建议涉及当前未开放能力，模型 MUST 改为建议用户补充信息、询问普通训练问题或继续当前可执行范围

## REMOVED Requirements

### Requirement: AI 建议必须统一为 assistantSuggestions
**Reason**: 当前用户端需求只需要“按钮文字就是点击后发送的提问文本”，复杂 `assistantSuggestions` 对象协议会继续引入 `label`、`message`、`kind`、`blocking`、`source` 和 `targetOperation` 等当前主链不需要的语义分裂。

**Migration**: 使用新增的 `suggestedQuestions` 合同替代聊天主链用户可见建议。实现阶段可以把旧 `assistantSuggestions` 中可直接发送的 `message` 归一化为 `suggestedQuestions`，但新模型输出、stream、前端消息和测试应优先使用 `suggestedQuestions`。

### Requirement: Blocking 建议优先于非阻断建议
**Reason**: `suggestedQuestions` 不再携带 `blocking` 字段。阻断与非阻断语义应由 `ask_user`、`final_answer`、runtime terminal state 和正文内容表达，而不是由按钮对象字段表达。

**Migration**: 当需要用户补充信息时，模型使用 `ask_user` 的 `question` 表达阻断问题，并可通过 `suggestedQuestions` 提供可点击回答候选。当回答已自然收口时，模型可以在 `final_answer` 中可选输出非阻断下一步建议。

### Requirement: 用户可见建议必须通过结构化产品能力边界
**Reason**: 聊天主链建议提问只会作为下一轮普通用户消息发送，不直接执行保存、验证、写入或业务 tool action。继续要求每条建议带 `targetOperation` 会让简单建议提问重新变成复杂操作按钮协议。

**Migration**: 服务端继续通过 AgentAction、tool schema、ResourceStore、Policy Guard、Response Renderer 和业务 validator 保护下一轮真实执行。`suggestedQuestions` 本身只做字符串结构、数量、去重和安全边界校验，不根据按钮文案推断能力。
