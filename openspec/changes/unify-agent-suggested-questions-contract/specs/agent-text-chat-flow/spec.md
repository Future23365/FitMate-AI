## ADDED Requirements

### Requirement: AgentAction 终态必须统一使用 suggestedQuestions
生产文本聊天的 `AgentAction` 终态 SHALL 使用 `suggestedQuestions` 表达用户可见建议提问。`final_answer` 和 `ask_user` MUST 使用同一个字段名和同一套结构约束，避免把最终回答建议、澄清选项和前端按钮拆成多套字段。

#### Scenario: final_answer 输出建议提问
- **WHEN** LLM 返回合法 `final_answer`
- **AND** 该回答存在自然的下一步建议提问
- **THEN** terminal action MAY 包含 `suggestedQuestions`
- **AND** `suggestedQuestions` MUST 是最多 3 条字符串的数组
- **AND** 每条字符串 MUST 能作为下一轮用户消息直接发送

#### Scenario: ask_user 输出建议提问
- **WHEN** LLM 返回合法 `ask_user`
- **AND** 澄清问题存在可点击的用户回答候选
- **THEN** terminal action MAY 包含 `suggestedQuestions`
- **AND** Response Renderer MUST 将这些建议提问与澄清问题一起投影给前端
- **AND** terminal action MUST NOT 使用另一套 `suggestions` 字段表达相同语义

#### Scenario: 旧终态字段进入兼容迁移
- **WHEN** 实现阶段仍遇到旧 `final_answer.assistantSuggestions`、旧 `ask_user.suggestions` 或等价历史字段
- **THEN** 系统 MAY 在迁移期将其归一化为 `suggestedQuestions`
- **AND** 新模型输出、schema 示例、测试 fixture 和 trace 断言 MUST 优先使用 `suggestedQuestions`
- **AND** 系统 MUST NOT 因兼容旧字段而在新生产路径继续扩散旧字段名

### Requirement: 文本聊天 stream 必须输出 suggested_questions 事件
默认 Response Renderer SHALL 将已校验的 `suggestedQuestions` 投影为统一 NDJSON 事件。该事件只承载用户可见建议提问文本，前端点击后仍按普通用户消息发送。

#### Scenario: Response Renderer 输出 suggested_questions
- **WHEN** Runtime 以包含 `suggestedQuestions` 的 terminal action 结束
- **THEN** Response Renderer MUST 输出 `suggested_questions` 事件
- **AND** 事件 payload MUST 包含 `suggestedQuestions`
- **AND** `suggestedQuestions` MUST 保持 terminal action 中已校验的字符串数组语义
- **AND** Response Renderer MUST NOT 让 LLM 直接生成 NDJSON event

#### Scenario: 前端消费 suggested_questions
- **WHEN** chat client 收到 `suggested_questions` 事件
- **THEN** 前端 MUST 将 `suggestedQuestions` 写入当前 assistant message 的 `suggestedQuestions` 字段
- **AND** 前端 MUST 将每条建议提问渲染为可点击按钮
- **AND** 点击按钮后 MUST 按普通用户消息发送该字符串
- **AND** 前端 MUST NOT 根据按钮文案推断业务 action、toolName 或保存操作

#### Scenario: assistant_suggestions 仅作为迁移兼容
- **WHEN** chat client 或历史 stream 仍收到旧 `assistant_suggestions` 事件
- **THEN** 前端 MAY 将其中的字符串建议归一化为 `suggestedQuestions`
- **AND** 新 Response Renderer 测试 MUST 断言主路径输出 `suggested_questions`
- **AND** 同一条 assistant message MUST NOT 因新旧事件兼容重复展示同一条建议提问
