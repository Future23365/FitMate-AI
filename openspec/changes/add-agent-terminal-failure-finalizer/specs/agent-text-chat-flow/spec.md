## ADDED Requirements

### Requirement: 文本聊天流必须支持 terminal failure finalizer 响应

系统 SHALL 允许 production chat adapter 将 terminal failure finalizer 的合法输出投影为标准 NDJSON 聊天事件。该响应 MUST 与普通 assistant 文本消息兼容，但 MUST 在 trace 和响应摘要中标记为失败收口，不得标记为主 Agent 成功完成。

#### Scenario: finalizer 输出 NDJSON

- **WHEN** terminal failure finalizer 返回合法 `content` 和可选 `suggestedQuestions`
- **THEN** `/api/chat` MUST 输出 `content` 事件
- **AND** 如存在建议问题，`/api/chat` MUST 输出 `suggested_questions` 事件
- **AND** `/api/chat` MUST 输出 `done` 事件
- **AND** `/api/chat` MUST NOT 输出 `error` 事件作为该失败的用户可见主结果
- **AND** `/api/chat` MUST NOT 输出被拒绝的 `visible_output`、旧 `assistant_action`、旧 `intent_resolved` 或旧 card trigger

#### Scenario: finalizer 响应不是主 Agent final_answer

- **WHEN** `/api/chat` 输出 terminal failure finalizer 响应
- **THEN** 响应摘要 MUST 将 `projectionType` 记录为 `terminal_failure_finalizer` 或等价类型
- **AND** trace final decision MUST 保留主 Agent failure code
- **AND** trace MUST NOT 将该响应记录为主 Agent `final_answer_success`

### Requirement: finalizer 阶段不得影响 stream 进度和加载状态

生产文本聊天 SHALL 在 finalizer 阶段继续输出前端可消费的终态事件，并保证前端加载、reasoning 和活动状态可以正常结束。finalizer 失败时 MUST 仍输出 `done` 或等价结束事件。

#### Scenario: finalizer 成功结束当前 assistant message

- **WHEN** 前端收到 terminal failure finalizer 产生的 `content`、可选 `suggested_questions` 和 `done`
- **THEN** 当前 assistant message MUST 结束 loading 状态
- **AND** 当前 assistant message MAY 展示建议问题
- **AND** 前端 MUST NOT 展示页面级错误提示替代该 assistant 回复

#### Scenario: finalizer 降级仍结束 stream

- **WHEN** finalizer 超时、输出无效或 provider availability gate 拒绝
- **THEN** `/api/chat` MUST 输出确定性 fallback 的终态事件
- **AND** 响应 MUST 包含 `done` 或等价流结束信号
- **AND** 前端 MUST 清理当前请求 loading / reasoning 状态

### Requirement: finalizer 不得恢复旧聊天事件协议

系统 SHALL 继续使用当前 NDJSON 白名单事件协议。terminal failure finalizer 的加入 MUST NOT 恢复旧 `assistant_action`、旧 `intent_resolved`、旧 `agent_execution_result`、旧 card trigger 或前端正文 trigger。

#### Scenario: finalizer 响应只使用白名单事件

- **WHEN** `/api/chat` 返回 terminal failure finalizer 响应
- **THEN** 响应事件类型 MUST 限定为当前白名单中的 `agent_progress`、`agent_loop`、`content`、`suggested_questions`、`done` 或等价安全事件
- **AND** 响应 MUST NOT 输出旧兼容事件
- **AND** 前端 MUST NOT 根据 finalizer 正文推断训练卡片、保存结果或业务 action
