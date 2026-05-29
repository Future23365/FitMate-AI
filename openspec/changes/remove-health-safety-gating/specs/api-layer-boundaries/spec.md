## MODIFIED Requirements

### Requirement: Chat orchestration lives in server modules
系统 SHALL 将 `/api/chat` 的 AI 编排和确定性聊天业务规则放在 `lib/server/chat/*` 或等价的服务端模块中。

#### Scenario: Chat intent is resolved
- **WHEN** the system needs to resolve chat intent for `/api/chat`
- **THEN** the intent schema, model JSON request, response parsing, fallback handling, and trace step recording MUST be owned by a server chat module
- **AND** the implementation MUST preserve the current intent fields, including `type`, `needsExerciseContext`, `workoutIntent`, `requestedExerciseName`, `canTriggerAction`, `missingActionFields`, and `suggestedReplies`

#### Scenario: Exercise context is needed
- **WHEN** resolved chat intent requires exercise context
- **THEN** the server chat module MUST retrieve exercises through the existing server exercise service
- **AND** the server chat module MUST select candidates through the existing workout candidate service
- **AND** the server chat module MUST expose only validated candidate context needed by the chat response prompt

#### Scenario: Assistant action is derived
- **WHEN** the system derives an internal assistant action from chat intent and candidate context
- **THEN** the deterministic action resolution MUST live in a testable server function
- **AND** the function MUST preserve existing action types for exercise recommendation, workout routine, and workout plan
- **AND** the function MUST ignore health, injury, pain, medical, or body-restriction fields when deciding whether missing fields block action triggering

#### Scenario: Chat response stream is generated
- **WHEN** the system generates the user-visible chat response
- **THEN** the server chat module MUST construct the model request using the existing conversation context, selected AI context messages, prompt config, thinking setting, and exercise context
- **AND** the stream encoder MUST preserve existing event semantics, including content deltas, token usage when provided, errors, and final trace metadata
