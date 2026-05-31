## MODIFIED Requirements

### Requirement: Chat orchestration lives in server modules

系统 SHALL 将 `/api/chat` 的 AI 编排和确定性聊天业务规则放在 `lib/server/chat/*` 或等价的服务端模块中。

#### Scenario: Chat intent is resolved
- **WHEN** the system needs to resolve chat intent for `/api/chat`
- **THEN** the intent schema, model JSON request, response parsing, fallback handling, and trace step recording MUST be owned by a server chat module
- **AND** the implementation MUST preserve the current intent fields, including `type`, `needsExerciseContext`, `workoutIntent`, `requestedExerciseName`, `canTriggerAction`, `missingActionFields`, and `suggestedReplies`

#### Scenario: Non-executable intent includes suggested replies without workout intent
- **WHEN** the chat intent model returns `canTriggerAction=false`
- **AND** the model returns valid `suggestedReplies`
- **AND** the model returns `workoutIntent=null` or omits `workoutIntent`
- **AND** the intent type or response mode does not require a training artifact to be generated
- **THEN** the server chat module MUST normalize `workoutIntent` to an absent internal value
- **AND** the server chat module MUST preserve the valid `suggestedReplies`
- **AND** the response stream MUST include a `suggested_replies` event with those replies
- **AND** the server chat module MUST NOT replace the whole intent with an empty fallback solely because `workoutIntent` is `null`

#### Scenario: Executable intent has invalid workout intent
- **WHEN** the chat intent model indicates that an exercise recommendation, routine, workout plan, patch, replacement, or explanation should be generated
- **AND** the required execution fields fail schema validation
- **THEN** the server chat module MUST NOT trigger the internal action
- **AND** the failure MUST be handled through clarification, recoverable fallback, or a traceable hard failure
- **AND** the server chat module MUST NOT silently generate a training artifact from invalid execution fields

#### Scenario: Suggested replies are invalid
- **WHEN** the chat intent model returns `suggestedReplies`
- **AND** one or more replies fail the server validation rules for user-visible quick replies
- **THEN** the server chat module MUST drop or sanitize only the invalid quick replies
- **AND** the server chat module MUST NOT use invalid quick replies to trigger an internal action
- **AND** the trace MUST make the final visible suggested replies inspectable
