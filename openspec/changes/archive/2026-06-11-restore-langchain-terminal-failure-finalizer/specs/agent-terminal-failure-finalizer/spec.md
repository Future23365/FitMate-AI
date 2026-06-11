## ADDED Requirements

### Requirement: LangChain production failure 必须先尝试 terminal failure finalizer

系统 SHALL 在当前 LangChain `/api/chat` 主 Agent 返回可分类失败后，先尝试一次 terminal failure finalizer，再决定是否降级到确定性 fallback。该 finalizer MUST 不属于 LangChain 主 Agent loop，MUST 不增加业务 tool 调用次数，MUST 不继续执行原始训练方案生成任务。

#### Scenario: budget_exhausted 触发 LangChain finalizer

- **WHEN** `runLangChainAgentRuntime()` 返回 `ok = false`
- **AND** `code = "budget_exhausted"`
- **AND** provider 配置可用且 finalizer 未被禁用
- **THEN** `/api/chat` MUST 尝试调用 terminal failure finalizer
- **AND** finalizer MUST 最多调用一次
- **AND** 主 Agent run MUST 保留失败状态，不得被改写为成功完成

#### Scenario: tool schema failure 触发 LangChain finalizer

- **WHEN** `runLangChainAgentRuntime()` 返回 `ok = false`
- **AND** `code = "tool_schema_invalid"` 或 tool execution 中存在 `failureCode = "tool_schema_invalid"`
- **THEN** `/api/chat` MUST 尝试调用 terminal failure finalizer
- **AND** finalizer 输入 MUST 包含稳定 schema issue 摘要
- **AND** finalizer MUST NOT 接收完整 raw tool payload

### Requirement: LangChain finalizer 输入必须是脱敏失败摘要

系统 SHALL 为 LangChain terminal failure finalizer 构造独立模型输入。该输入 MUST 只包含脱敏后的用户请求摘要、稳定失败类别、错误码、失败 tool 摘要、schema issue 摘要和当前可安全告知用户的事实摘要；MUST NOT 包含完整 provider request、完整 prompt、secret、authorization、cookie、stack、数据库连接信息、跨用户数据或完整 raw tool payload。

#### Scenario: 输入包含可恢复失败事实

- **WHEN** finalizer input builder 处理 LangChain run failure
- **THEN** 输入 MUST 包含 `failureCategory`
- **AND** 输入 MUST 包含 `errorCode`
- **AND** 输入 MUST 包含用户请求摘要
- **AND** 输入 MUST 包含失败 tool 的 `toolName`、`failureCode`、`failureMessage` 和可用 `schemaIssues`
- **AND** 输入 MUST 表达 `allowedResponseMode = "failure_explanation_only"`

#### Scenario: 输入不泄漏执行细节

- **WHEN** finalizer input builder 构造模型可见 payload
- **THEN** 输入 MUST NOT 包含 API key、authorization、cookie、stack、provider 原始 HTTP body、完整 prompt、完整 tool output、完整 raw tool input 或跨用户 payload
- **AND** 输入 MUST NOT 包含服务端根据用户原文关键词、正则、同义词表、短句模板或 phrasing 推断的 intent 分类

### Requirement: LangChain finalizer 不得恢复旧 Agent 合同

系统 SHALL 保持当前 LangChain native tool calling 和 responseFormat 成功终态合同。terminal failure finalizer 的加入 MUST NOT 恢复旧 `AgentAction` JSON、旧 `PlannerPort`、旧 `ToolRegistry` 生产主链或旧 Response Renderer。

#### Scenario: finalizer 不接收工具目录

- **WHEN** terminal failure finalizer 被调用
- **THEN** finalizer MUST NOT 接收 LangChain tool catalog
- **AND** finalizer MUST NOT 输出 `tool_call`
- **AND** finalizer MUST NOT 输出 `AgentAction`
- **AND** finalizer MUST NOT 输出 `visibleOutputs`
- **AND** finalizer MUST NOT 保存 artifact、训练事实、用户记忆或数据库记录
