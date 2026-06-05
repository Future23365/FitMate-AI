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

#### Scenario: Legacy downstream AI routes are absent
- **WHEN** chat plan, routine, patch or recommendation generation needs AI orchestration after the move
- **THEN** the implementation MUST use `/api/chat` Agent-first stream/result contracts, Agent registry tools, or deterministic result-level operations
- **AND** the implementation MUST NOT keep a separate downstream chat AI route as a compatibility execution surface

#### Scenario: AI trace is inspected
- **WHEN** a developer inspects the AI trace for a chat request after the refactor
- **THEN** the trace MUST still show the same major stages for user input, intent resolution, candidate selection when applicable, model request, model response, internal action, and completion
- **AND** token usage semantics MUST remain compatible with the existing trace viewer
- **AND** the trace MUST make the natural language summary context visible enough to verify that full history was not sent to the model

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

### Requirement: 私有 API 通过 cookie 建立匿名用户上下文
系统 SHALL 让私有 Route Handler 通过服务端 auth helper 从 HttpOnly cookie 建立当前匿名用户上下文，并保持 Route Handler 只承担 HTTP 边界适配职责。

#### Scenario: 私有接口收到有效匿名 cookie
- **WHEN** 私有 `app/api/*/route.ts` 收到包含有效匿名 auth cookie 的请求
- **THEN** Route Handler MUST 调用服务端 auth helper 建立 request-level auth context
- **AND** Route Handler MUST 将解析出的 `userId` 传递给服务层
- **AND** Route Handler MUST NOT 直接在路由中复制 token 校验、签名解析或用户隔离业务逻辑

#### Scenario: 私有接口缺少匿名 cookie
- **WHEN** 私有 `app/api/*/route.ts` 收到缺少匿名 auth cookie 的请求
- **THEN** 服务端 auth helper MUST 返回稳定的 unauthenticated 结果
- **AND** Route Handler MUST 将该结果映射为 `401 unauthenticated`
- **AND** 如果历史兼容路径暂时返回 `403`，响应体 MUST 明确表达这是未认证而不是权限不足

#### Scenario: 私有接口收到无效匿名 cookie
- **WHEN** 私有 `app/api/*/route.ts` 收到签名错误、过期或格式无效的匿名 auth cookie
- **THEN** 系统 MUST 拒绝建立当前用户上下文
- **AND** Route Handler MUST NOT 调用需要 `userId` 的服务层写入或读取私有数据
- **AND** 响应 MUST 能被客户端请求层识别为需要登录

#### Scenario: 已认证但无权访问资源
- **WHEN** 请求包含有效匿名 cookie 但用户访问不属于自己的资源
- **THEN** 服务层 MUST 继续基于 `userId` 做权限隔离
- **AND** Route Handler MUST 返回 forbidden 或 not found 语义
- **AND** 客户端请求层 MUST NOT 因该响应打开登录 Dialog，除非响应体明确表示未认证

### Requirement: Route handlers establish authenticated request context
系统 SHALL 由除匿名会话 bootstrap 之外的现有 API Route Handler 建立请求级鉴权上下文，再将经过校验的当前用户传递给服务层。

#### Scenario: Existing API route receives authenticated request
- **WHEN** 除 `app/api/auth/local-anonymous/route.ts` 之外的现有 `app/api/*/route.ts` 收到携带有效匿名凭证的请求
- **THEN** Route Handler MUST 在调用业务服务前解析当前用户
- **AND** Route Handler MUST 将 `CurrentUser`、`userId` 或等价的请求上下文传递给服务层
- **AND** 服务层 MUST 基于该上下文执行用户私有数据查询或写入

#### Scenario: Existing API route receives unauthenticated request
- **WHEN** 除 `app/api/auth/local-anonymous/route.ts` 之外的现有 `app/api/*/route.ts` 收到缺少或无效匿名凭证的请求
- **THEN** Route Handler MUST 返回统一 `401 unauthenticated` 响应
- **AND** Route Handler MUST NOT 调用聊天编排、训练持久化、artifact、用户记忆或其他会读写用户私有数据的服务
- **AND** Route Handler MUST NOT 通过固定开发用户继续执行请求

#### Scenario: Anonymous session bootstrap route receives unauthenticated request
- **WHEN** `app/api/auth/local-anonymous/route.ts` 收到没有匿名凭证的创建请求
- **THEN** Route Handler MAY 创建新的匿名用户和匿名凭证
- **AND** Route Handler MUST NOT 通过固定开发用户继续执行请求

