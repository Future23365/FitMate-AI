## ADDED Requirements

### Requirement: Chat stream exposes unified assistant suggestions

系统 SHALL 在 `/api/chat` 服务端编排层统一输出 AI 建议事件，并保持旧建议字段的兼容迁移路径。

#### Scenario: Unified suggestions are streamed

- **WHEN** `/api/chat` 本轮产生用户可见建议
- **THEN** the server chat module MUST emit an `assistant_suggestions` stream event or equivalent unified event
- **AND** the event MUST include normalized `assistantSuggestions`
- **AND** the route handler MUST NOT assemble assistant suggestion business logic inline

#### Scenario: Legacy suggested replies remain compatible

- **WHEN** old clients still listen for `suggested_replies` or messages still contain `suggestedReplies`
- **THEN** the server and frontend MAY continue compatibility handling during migration
- **AND** duplicate suggestions MUST NOT be rendered twice
- **AND** new implementation paths SHOULD prefer `assistantSuggestions` as the single user-visible suggestion model

#### Scenario: Suggestions are traceable

- **WHEN** assistant suggestions are generated, filtered, dropped, or deduplicated
- **THEN** AI Trace MUST expose the original source fields or stage
- **AND** AI Trace MUST expose the final visible `assistantSuggestions`
- **AND** AI Trace MUST expose why non-user-tone or non-executable suggestions were filtered
