## ADDED Requirements

### Requirement: Trace 页面必须展示当前文本聊天 trace
`/dev/ai-traces` SHALL 能列出并展示当前新 `agent-core` 文本聊天主链写入的 `AiTrace`。页面 MUST 保留通用历史 trace 查看器能力，并提供 Raw JSON 入口。

#### Scenario: 开发者查看最新文本聊天 trace
- **WHEN** 已认证用户完成一次进入文本聊天接入服务的 `/api/chat` 请求
- **THEN** `/api/dev/ai-traces` MUST 返回该用户可见的最新 trace
- **AND** `/dev/ai-traces` MUST 在列表中展示该 trace 的标题、route、状态、创建时间和耗时
- **AND** 页面 MUST 允许开发者选择该 trace 查看步骤详情和请求概览

#### Scenario: 只显示当前用户 trace
- **WHEN** 开发态 trace store 中存在多个用户的 trace
- **THEN** `/api/dev/ai-traces` MUST 只返回当前 `CurrentUser.id` 对应的 trace
- **AND** 页面 MUST NOT 展示其他用户的 trace payload

#### Scenario: 文本聊天没有业务 tool
- **WHEN** 当前文本聊天 trace 的 registry 为空且没有业务 tool result
- **THEN** 页面 MUST 仍展示请求输入、runtime 事件、validation、response write 和 error 中已记录的步骤
- **AND** 页面 MUST NOT 把“未记录业务 tool”或“未记录旧 Agent run 诊断”当作业务失败

### Requirement: Trace 页面导出必须包含文本聊天 trace 摘要
`/dev/ai-traces` SHALL 支持将当前文本聊天 trace 导出到现有开发日志文件。导出 MUST 保留 Raw trace 入口和可读分组摘要，并继续遵守脱敏边界。

#### Scenario: 保存全链路 log
- **WHEN** 开发者选择当前文本聊天 trace 并点击保存全链路 log
- **THEN** 系统 MUST 写入 `codex_logs/ai_trace_log.js`
- **AND** 保存内容 MUST 包含 trace 标题、route、状态、runtime event 摘要、响应事件摘要和 Raw trace payload
- **AND** 保存内容 MUST NOT 包含 API key、authorization、cookie、跨用户 payload 或未经截断的大 payload

#### Scenario: 保存用户问答记录
- **WHEN** 开发者选择当前文本聊天 trace 并点击保存用户问答记录
- **THEN** 系统 MUST 追加写入 `codex_logs/prompt.js`
- **AND** 保存内容 MUST 只包含保存时间、trace 标识、用户问题列表和最终文本回答
- **AND** 保存内容 MUST NOT 保存完整 tool payload、候选池、校验详情或完整 trace payload
