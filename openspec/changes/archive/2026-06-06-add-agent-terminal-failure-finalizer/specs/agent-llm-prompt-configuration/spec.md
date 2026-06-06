## ADDED Requirements

### Requirement: Terminal failure finalizer prompt 必须集中配置

系统 SHALL 为 terminal failure finalizer 提供独立模型可见 prompt 配置。该 prompt MUST 位于服务端集中配置入口，MUST 与主 Agent planner prompt 区分，MUST 使用中文描述业务边界，MUST 保持技术标识英文原样。

#### Scenario: finalizer system prompt 来自配置模块

- **WHEN** terminal failure finalizer 构造模型请求
- **THEN** system message MUST 来自 `lib/server/config/` 下的 finalizer prompt 配置或等价集中入口
- **AND** finalizer adapter MUST NOT 在供应商请求构造函数中内联默认 prompt 句子
- **AND** prompt 配置 MUST 暴露稳定版本标识，例如 `promptVersion`

#### Scenario: finalizer prompt 与主 Agent prompt 分离

- **WHEN** 开发者查看 finalizer prompt 配置
- **THEN** finalizer prompt MUST NOT 复用主 Agent planner 的完整 tool loop 指令
- **AND** finalizer prompt MUST NOT 描述 `tool_call` 作为可用输出
- **AND** finalizer prompt MUST NOT 要求模型输出 `AgentAction`
- **AND** finalizer prompt MUST 明确本阶段只生成失败解释和下一步建议问题

### Requirement: finalizer prompt 必须严格说明本轮未满足需求

terminal failure finalizer system prompt SHALL 明确告知模型：主 Agent 已经耗尽内部修复机会，本轮没有满足用户需求，模型不得声称已完成或继续执行。该说明 MUST 是模型实际可见输入的一部分。

#### Scenario: prompt 禁止成功承诺

- **WHEN** finalizer system prompt 被构造
- **THEN** prompt MUST 明确“本轮没有满足用户需求”或等价语义
- **AND** prompt MUST 禁止模型声称已生成、已保存、已查询、已确认、已执行或已展示未发生的业务结果
- **AND** prompt MUST 禁止输出训练卡片、JSON payload、NDJSON event、`visibleOutputs`、`tool_call` 或 `AgentAction`

#### Scenario: prompt 限制建议问题

- **WHEN** finalizer system prompt 描述 `suggestedQuestions`
- **THEN** prompt MUST 说明建议问题最多 3 条
- **AND** prompt MUST 说明每条建议问题必须是用户口吻的完整自然语言问题
- **AND** prompt MUST 说明建议问题只是下一轮用户消息候选，不代表服务端已经执行任何操作
- **AND** prompt MUST 禁止建议问题承诺不可用能力、医疗诊断、保存结果或未注册 tool

### Requirement: finalizer 模型输入必须使用结构化失败摘要

系统 SHALL 让 terminal failure finalizer 的 user message 使用结构化 JSON 摘要，而不是直接复制主 Agent prompt、完整 conversation payload 或完整 tool results。该摘要 MUST 让模型理解失败原因和可恢复方向，同时避免泄漏内部实现。

#### Scenario: user message 包含失败摘要

- **WHEN** finalizer 构造 user message
- **THEN** user message MUST 包含主 Agent failure category、稳定错误 code、用户目标摘要、未满足要求摘要和允许回复模式
- **AND** user message MUST 包含已验证事实的脱敏摘要
- **AND** user message MUST 使用中文描述业务含义
- **AND** `failureCategory`、`suggestedQuestions`、`visibleOutputs` 等技术标识 MUST 保持英文原样

#### Scenario: user message 不复制主 Agent 可执行上下文

- **WHEN** finalizer 构造 user message
- **THEN** user message MUST NOT 包含 tool manifest
- **AND** user message MUST NOT 包含完整 `PlannerInput`
- **AND** user message MUST NOT 包含完整 `toolResults.output`
- **AND** user message MUST NOT 包含服务端根据用户原文关键词或 phrasing 生成的业务意图

### Requirement: finalizer 输出 schema 必须独立于 AgentAction

系统 SHALL 为 terminal failure finalizer 输出定义独立 schema。该 schema MUST 只允许 `content` 和可选 `suggestedQuestions`，MUST NOT 与主 Agent `AgentAction` schema 混用。

#### Scenario: output schema 只允许失败回复字段

- **WHEN** finalizer 返回模型输出
- **THEN** 系统 MUST 使用独立 schema 校验输出
- **AND** schema MUST 要求 `content` 为非空字符串
- **AND** schema MUST 允许 `suggestedQuestions` 为最多 3 条字符串
- **AND** schema MUST 拒绝 `type`、`toolName`、`input`、`visibleOutputs`、`usedRefs` 或其他 `AgentAction` 字段

#### Scenario: 输出校验失败不进入 repair

- **WHEN** finalizer 输出 schema 校验失败
- **THEN** 系统 MUST 不再向模型发送 repair prompt
- **AND** production adapter MUST 使用确定性 fallback
- **AND** trace MUST 记录 finalizer 输出校验失败
