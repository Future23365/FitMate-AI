## MODIFIED Requirements

### Requirement: 建议提问必须统一为 suggestedQuestions
系统 SHALL 使用 `suggestedQuestions` 表达聊天主链用户可见建议提问。每条建议提问 SHALL 是用户点击后可以直接发送的完整用户消息；前端 SHALL 展示同一段文本作为按钮文案。LangChain 文本聊天成功终态产生建议提问时，建议 MUST 由结构化 `suggestedQuestions` 字段承载，不得只写入用户可见正文。

#### Scenario: 服务端输出建议提问
- **WHEN** 本轮聊天产生一个或多个用户可见建议提问
- **THEN** 服务端 MUST 输出 `suggestedQuestions`
- **AND** 每条建议提问 MUST 是非空字符串
- **AND** 建议提问数量 MUST 不超过 3 条
- **AND** 前端 MUST 能用该字段渲染建议按钮

#### Scenario: LangChain 成功回复投影建议提问
- **WHEN** LangChain runtime 成功结果包含 `suggestedQuestions`
- **THEN** production response adapter MUST 输出 `suggested_questions` NDJSON 事件
- **AND** 该事件 MUST 使用 runtime 已校验的 `suggestedQuestions`
- **AND** 响应摘要 MUST 记录正确的 `suggestedQuestionCount`
- **AND** 服务端 MUST NOT 从 `content` 正文、用户原文、关键词、正则、同义词表或短句模板中提取建议提问

#### Scenario: 建议提问点击后发送原文本
- **WHEN** 用户点击一条建议提问按钮
- **THEN** 前端 MUST 将该条 `suggestedQuestions` 文本作为下一轮用户消息发送
- **AND** 前端 MUST NOT 使用另一个 hidden message、label、targetOperation 或内部 action 替代该文本

#### Scenario: 旧建议字段不归一到 suggestedQuestions
- **WHEN** 历史消息、旧 stream 或旧服务端结果仍包含 `assistantSuggestions`、`suggestedReplies`、`suggestions` 或旧 `assistant_suggestions`
- **THEN** 系统 MUST NOT 将这些旧字段归一化为 `suggestedQuestions`
- **AND** 新生产写入路径 MUST 只使用 `suggestedQuestions`
- **AND** 新测试 MUST 覆盖旧字段不进入聊天主链建议提问投影
