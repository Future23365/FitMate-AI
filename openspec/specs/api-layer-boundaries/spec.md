# api-layer-boundaries Specification

## Purpose
Define the responsibilities and dependency direction for Next.js Route Handlers, server-side orchestration modules, AI prompt configuration, frontend feature modules, and shared code.
## Requirements
### Requirement: Route handlers remain HTTP boundary adapters
系统 SHALL 将 Next.js `app/api/*/route.ts` 作为 HTTP 边界适配层，而不是主要业务编排层。

#### Scenario: Chat route receives a valid request
- **WHEN** `/api/chat` receives a valid chat request
- **THEN** the Route Handler MUST validate the HTTP input
- **AND** the Route Handler MUST create or pass the request-level execution context needed by the service layer
- **AND** the Route Handler MUST delegate chat intent resolution, exercise context construction, assistant action resolution, model request construction, and stream generation to `lib/server` modules
- **AND** the Route Handler MUST return the same externally observable stream event format as before the refactor

#### Scenario: Chat route receives an invalid request
- **WHEN** `/api/chat` receives invalid JSON or a request body that fails the chat request schema
- **THEN** the Route Handler MUST return the existing validation error response shape
- **AND** the Route Handler MUST NOT call model providers, exercise services, or downstream AI generation services

#### Scenario: Service layer returns a failure
- **WHEN** the delegated chat service returns a known failure code
- **THEN** the Route Handler MUST map that failure to the appropriate HTTP response
- **AND** the Route Handler MUST NOT duplicate the service-layer business decision logic inline

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

### Requirement: AI prompt config belongs to server AI configuration
系统 SHALL 将服务端模型调用使用的 prompt 配置放在服务端 AI 配置模块中，而不是放在 `app/api` 路由目录中。

#### Scenario: Server AI service imports prompt config
- **WHEN** a server AI service needs prompt text or model-call prompt fragments
- **THEN** it MUST import prompt configuration from `lib/server/ai/*` or another explicitly server-owned configuration module
- **AND** it MUST NOT import prompt configuration from `app/api/*`

#### Scenario: Route handler needs prompt-backed chat behavior
- **WHEN** a Route Handler needs behavior that depends on prompt config
- **THEN** it MUST call a server service that owns that prompt-backed behavior
- **AND** it SHOULD NOT assemble prompt text directly unless the prompt is route-specific adapter text with no shared service meaning

#### Scenario: Prompt config is moved
- **WHEN** `aiPromptConfig` is moved out of `app/api`
- **THEN** all existing model call sites MUST continue to use the same prompt content unless a separate prompt behavior change is proposed
- **AND** no client component or frontend feature module may directly import the server prompt config

### Requirement: Module dependency direction is enforceable
系统 SHALL 保持 `features`、`app/api`、`lib/server` 和 `lib/shared` 之间的依赖方向清晰且可检查。

#### Scenario: Frontend feature imports code
- **WHEN** code under `features/*` imports project modules
- **THEN** it MAY import `components/*`, `lib/client/*`, and `lib/shared/*`
- **AND** it MUST NOT import `lib/server/*` or server-only AI prompt config modules

#### Scenario: Server service imports code
- **WHEN** code under `lib/server/*` imports project modules
- **THEN** it MAY import `lib/shared/*` and other `lib/server/*` modules
- **AND** it MUST NOT import from `app/api/*` for shared configuration, schemas, business rules, or prompt config

#### Scenario: Shared module imports code
- **WHEN** code under `lib/shared/*` imports project modules
- **THEN** it MUST remain safe for both client and server execution
- **AND** it MUST NOT import database access, environment-variable-dependent services, model clients, browser state, or `app/api/*`

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

