## MODIFIED Requirements

### Requirement: Chat stream exposes unified assistant suggestions

系统 SHALL 在 `/api/chat` 服务端编排层统一输出建议提问事件。新生产路径 MUST 只使用 `suggestedQuestions` 作为建议提问语义字段，不为旧建议字段增加迁移或兼容转换。

#### Scenario: Unified suggestions are streamed

- **WHEN** `/api/chat` 本轮产生用户可见建议提问
- **THEN** the server chat module MUST emit a `suggested_questions` stream event or equivalent unified event
- **AND** the event MUST include normalized `suggestedQuestions`
- **AND** the route handler MUST NOT assemble suggested question business logic inline

#### Scenario: Legacy suggested replies are ignored

- **WHEN** old clients still listen for `assistant_suggestions`, `suggested_replies`, or messages still contain `suggestedReplies` / `assistantSuggestions`
- **THEN** the new server and frontend suggested-question path MUST NOT convert those old fields into `suggestedQuestions`
- **AND** new implementation paths MUST use `suggestedQuestions` as the single user-visible suggested question model
- **AND** old suggestion protocols MUST NOT drive new `/api/chat` suggested question rendering

#### Scenario: Suggestions are traceable

- **WHEN** suggested questions are generated, validated, dropped, or deduplicated
- **THEN** AI Trace MUST expose the original source fields or stage
- **AND** AI Trace MUST expose the final visible `suggestedQuestions`
- **AND** AI Trace MUST expose structural drop reasons such as empty text, too many items, duplicate text, or unsupported shape
