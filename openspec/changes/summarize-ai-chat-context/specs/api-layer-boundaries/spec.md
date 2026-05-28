## MODIFIED Requirements

### Requirement: Chat orchestration lives in server modules
系统 SHALL 将 `/api/chat` 的 AI 编排和确定性聊天业务规则放在 `lib/server/chat/*` 或等价的服务端模块中。

#### Scenario: Chat intent is resolved
- **WHEN** the system needs to resolve chat intent for `/api/chat`
- **THEN** the intent schema, model JSON request, response parsing, fallback handling, and trace step recording MUST be owned by a server chat module
- **AND** the implementation MUST preserve the current intent fields, including `type`, `needsExerciseContext`, `workoutIntent`, `requestedExerciseName`, `canTriggerAction`, `missingActionFields`, and `suggestedReplies`
- **AND** the model JSON request MUST use the current latest user message plus the server-maintained natural language conversation summary as its only conversation history input

#### Scenario: Exercise context is needed
- **WHEN** resolved chat intent requires exercise context
- **THEN** the server chat module MUST retrieve exercises through the existing server exercise service
- **AND** the server chat module MUST select candidates through the existing workout candidate service
- **AND** the server chat module MUST expose only validated candidate context needed by the chat response prompt

#### Scenario: Assistant action is derived
- **WHEN** the system derives an internal assistant action from chat intent and candidate context
- **THEN** the deterministic action resolution MUST live in a testable server function
- **AND** the function MUST preserve existing action types for exercise recommendation, workout routine, and workout plan

#### Scenario: Chat response stream is generated
- **WHEN** the system generates the user-visible chat response
- **THEN** the server chat module MUST construct the model request using the current latest user message, server-maintained natural language conversation summary, prompt config, thinking setting, and exercise context
- **AND** the server chat module MUST NOT include full conversation history or selected AI context message windows in model-visible messages
- **AND** the stream encoder MUST preserve existing event semantics, including content deltas, token usage when provided, errors, and final trace metadata

### Requirement: Refactor preserves existing external behavior
系统 SHALL 在 API 层边界重构期间保持现有用户可见行为和 HTTP 契约稳定，但本次上下文总结变更允许调整内部请求体中的上下文表示。

#### Scenario: Chat flow is refactored
- **WHEN** `/api/chat` orchestration is moved from the Route Handler into server modules
- **THEN** the external `/api/chat` URL, response stream format, validation error shape, and final trace id event MUST remain compatible with existing frontend code
- **AND** the request schema MAY replace model-visible structured conversation context and selected history messages with a natural language `conversationSummary` plus latest user message contract
- **AND** the refactor MUST NOT add or remove user-visible stream event types for the same user request

#### Scenario: Downstream AI routes continue to run
- **WHEN** `/api/ai/workout-plan` or `/api/ai/exercise-recommendations` uses AI prompt config after the move
- **THEN** the route behavior, model output validation, candidate exercise validation, and `parentTraceId` behavior MUST remain unchanged
- **AND** the route MUST use natural language `conversationSummary` and the latest relevant user request as model-visible conversation context instead of selected history messages

#### Scenario: AI trace is inspected
- **WHEN** a developer inspects the AI trace for a chat request after the refactor
- **THEN** the trace MUST still show the same major stages for user input, intent resolution, candidate selection when applicable, model request, model response, internal action, and completion
- **AND** token usage semantics MUST remain compatible with the existing trace viewer
- **AND** the trace MUST make the natural language summary context visible enough to verify that full history was not sent to the model
