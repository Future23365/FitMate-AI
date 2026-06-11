## ADDED Requirements

### Requirement: LangChain terminal failure finalizer 响应必须投影为普通聊天事件

生产 `/api/chat` SHALL 在 LangChain 主 Agent 失败且 terminal failure finalizer 返回合法输出时，将 finalizer 输出投影为当前 NDJSON 白名单中的普通聊天事件。该响应 MUST 区分于主 Agent 成功终态，MUST NOT 输出未通过校验的结构化训练卡片。

#### Scenario: finalizer 成功输出普通回复

- **WHEN** LangChain terminal failure finalizer 返回合法 `content`
- **AND** 可选返回合法 `suggestedQuestions`
- **THEN** `/api/chat` MUST 输出 `content` 事件
- **AND** 如存在建议问题，`/api/chat` MUST 输出 `suggested_questions` 事件
- **AND** `/api/chat` MUST 输出 `done` 事件
- **AND** `/api/chat` MUST NOT 输出被拒绝的 `visible_output`
- **AND** response summary MUST 将 `projectionType` 记录为 `terminal_failure_finalizer`

#### Scenario: finalizer 不可用时降级到确定性 fallback

- **WHEN** terminal failure finalizer 因配置缺失、provider 失败、超时、输出不可解析或输出 shape 不合法而失败
- **THEN** `/api/chat` MUST 使用现有确定性 fallback 事件收口
- **AND** 响应 MUST 包含 `done` 事件
- **AND** trace MUST 记录 finalizer 失败或跳过原因
- **AND** 主 Agent 原始失败 code MUST 保留在 response summary 或 trace 中
