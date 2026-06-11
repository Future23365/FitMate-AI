# terminal-failure-finalizer-output-contract Specification

## Purpose
TBD - created by archiving change relax-terminal-failure-finalizer-validation. Update Purpose after archive.
## Requirements
### Requirement: Terminal failure finalizer 输出只需符合用户回复 shape

系统 SHALL 将 terminal failure finalizer 的输出作为主 Agent 失败后的普通用户可见兜底回复处理。输出校验 MUST 只验证 JSON shape、允许字段、字段类型、非空内容、长度和建议问题数量；系统 MUST NOT 因 `content` 未命中特定失败披露短语、包含普通成功动词、或未避开某个内部技术词短语而丢弃 shape 合法的 finalizer 输出。

#### Scenario: shape 合法的 finalizer 输出被接受

- **WHEN** terminal failure finalizer 返回可解析 JSON object
- **AND** JSON 只包含非空 `content` 和可选 `suggestedQuestions`
- **AND** `suggestedQuestions` 数量和单条长度在配置边界内
- **THEN** production adapter MUST 接受该 finalizer 输出
- **AND** 响应 MUST 投影为 `content`、可选 `suggested_questions` 和 `done`
- **AND** 系统 MUST NOT 要求 `content` 命中固定中文失败披露短语

#### Scenario: shape 不合法时仍降级

- **WHEN** terminal failure finalizer 输出不可解析、不是 object、缺少非空 `content`、包含未知字段、`suggestedQuestions` 超限或建议项不是非空字符串
- **THEN** production adapter MUST 丢弃该 finalizer 输出
- **AND** 系统 MUST 使用确定性中文 fallback 收口
- **AND** trace MUST 记录 finalizer output validation failure 的稳定原因

### Requirement: finalizer 输出不得改变主 Agent 校验边界

系统 SHALL 保持 LangChain tool wrapper、结构化 final response schema、visible output validator、response adapter、trace summary 和权限隔离边界。放宽 finalizer 输出文案校验 MUST NOT 使未通过校验的结构化输出被渲染、保存或作为事实来源。

#### Scenario: finalizer 只输出普通聊天事件

- **WHEN** 主 Agent 因 `validatedVisibleOutputs`、结构化终态、tool execution 或业务 validator 校验失败而进入 terminal failure finalizer
- **AND** finalizer 返回 shape 合法输出
- **THEN** 响应 MUST NOT 输出被拒绝的 `visible_output` 事件
- **AND** 系统 MUST NOT 持久化被拒绝的 visible output
- **AND** 系统 MUST NOT 把 finalizer `content` 或 `suggestedQuestions` 注册为可消费业务事实
- **AND** trace MUST 区分 finalizer reply 和主 Agent 成功 `fitmate_final_response`
