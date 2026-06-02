## ADDED Requirements

### Requirement: 推荐卡片底部只展示 AI 建议

系统 SHALL 在聊天推荐卡片底部只展示本轮 AI 显式返回的 `assistantSuggestions`，不得展示固定写死的刷新或编排按钮。

#### Scenario: 推荐卡片展示 AI 建议

- **WHEN** 同一条助手消息生成 `exercise_recommendation` 推荐卡片
- **AND** 该消息存在一个或多个 `assistantSuggestions`
- **THEN** 前端 MUST 在推荐卡片底部原操作区展示这些建议
- **AND** 用户点击建议时，前端 MUST 将对应建议的 `message` 作为下一轮用户消息发送

#### Scenario: 推荐卡片没有建议

- **WHEN** 同一条助手消息生成 `exercise_recommendation` 推荐卡片
- **AND** 该消息没有可展示的 `assistantSuggestions`
- **THEN** 推荐卡片底部 MUST NOT 展示“换一批”“编成训练”或等价固定按钮
- **AND** 推荐卡片 MUST 继续展示动作列表、摘要、安全提醒和动作详情入口

#### Scenario: 非推荐消息保留原建议位置

- **WHEN** 助手消息没有生成 `exercise_recommendation` 推荐卡片
- **AND** 该消息存在一个或多个 `assistantSuggestions`
- **THEN** 前端 MUST 继续在消息正文下方展示这些建议
