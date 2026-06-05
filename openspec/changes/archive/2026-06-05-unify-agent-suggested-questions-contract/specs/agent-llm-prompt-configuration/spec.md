## ADDED Requirements

### Requirement: 默认 prompt 必须表达 suggestedQuestions 建议提问合同
系统 SHALL 在默认 Agent LLM prompt 中把 `suggestedQuestions` 表达为 `final_answer` 和 `ask_user` 都可使用的全局可选字段。该字段表示用户可直接点击发送的建议提问文本，而不是前端事件、内部 action、tool input 或业务确认结果。

#### Scenario: Prompt 描述 suggestedQuestions 输出格式
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `suggestedQuestions` 是可选字符串数组字段
- **AND** system message MUST 说明 `final_answer` 和 `ask_user` 都可以在适合时输出 `suggestedQuestions`
- **AND** system message MUST 说明每条建议提问必须是完整自然语言文本，点击后可作为下一轮用户消息直接发送
- **AND** system message MUST 使用中文描述业务含义
- **AND** `suggestedQuestions`、`final_answer`、`ask_user` 等技术标识 MUST 保持英文原样

#### Scenario: Prompt 限制 suggestedQuestions 数量和口吻
- **WHEN** 默认 prompt 描述 `suggestedQuestions`
- **THEN** system message MUST 说明最多输出 3 条建议提问
- **AND** system message MUST 说明每条建议提问必须使用用户口吻，不得写成助手对用户的命令、说明或追问模板
- **AND** system message MUST 说明建议提问不得重复正文内容
- **AND** system message MUST 说明如果当前回复已经自然结束或没有可靠下一步，可以不输出 `suggestedQuestions`

#### Scenario: Prompt 禁止 suggestedQuestions 承诺不可用能力
- **WHEN** 默认 prompt 描述 `suggestedQuestions`
- **THEN** system message MUST 说明建议提问不得承诺未注册 tool、未执行结果、未开放保存能力、医疗诊断或康复处方
- **AND** system message MUST 说明建议提问只是下一轮用户消息候选，不代表服务端已经执行任何操作
- **AND** system message MUST NOT 要求模型固定输出某个业务 `toolName`、固定 action 或固定训练结构

#### Scenario: Prompt 不强制所有回复输出 suggestedQuestions
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 要求每个 `final_answer` 或每个 `ask_user` 都必须包含 `suggestedQuestions`
- **AND** system message MUST 将是否输出建议提问交给模型基于当前可见上下文、tool result、observations 和用户目标判断
- **AND** system message MUST NOT 用固定用户短语或关键词作为输出建议提问的触发条件
