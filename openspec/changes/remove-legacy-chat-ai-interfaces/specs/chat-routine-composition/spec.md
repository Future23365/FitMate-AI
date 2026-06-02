## ADDED Requirements

### Requirement: Routine 卡片不得由旧 trigger JSON 触发
系统 SHALL 删除前端新聊天流中基于旧 trigger JSON 的 routine 或训练卡片触发路径。Routine 卡片 MUST 来自 Agent routine draft / validation / policy / persistence 工具链和 `AgentExecutionResult`。

#### Scenario: assistant 回复包含旧 trigger JSON
- **WHEN** 新聊天运行的 assistant 文本中包含 `workout_plan_trigger`、`workout_routine` 或其他历史遗留 trigger JSON
- **THEN** 前端 MUST NOT 将该文本解析成 routine 卡片
- **AND** routine 卡片 MUST 只由 `agent_execution_result`、artifact 事件、done metadata 或等价 Agent-first 事件触发

#### Scenario: 历史 routine 草稿需要展示
- **WHEN** 历史消息中存在旧 trigger JSON 或非 Agent-first routine 草稿
- **THEN** 系统 MAY 做纯展示兼容或忽略该旧草稿
- **AND** 系统 MUST NOT 为历史 trigger 新增生产执行兼容层
