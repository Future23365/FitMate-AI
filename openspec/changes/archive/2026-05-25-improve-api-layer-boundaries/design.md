## Context

项目当前采用 Next.js App Router，`app/` 负责页面路由和 Route Handler，`features/` 负责前端功能模块，`lib/server/` 负责服务端业务和 AI 编排，`lib/shared/` 负责前后端共享类型、Schema 和纯函数。这个分层方向是正确的，但聊天链路中仍有两个边界不够干净：

- `app/api/chat/route.ts` 同时包含请求校验、AI 意图解析、模型请求、动作候选筛选、system prompt 构造、AI Trace 记录、流式响应和错误处理。
- `app/api/ai-prompt-config.ts` 被 `app/api/chat/route.ts`、`lib/server/workout-plans/ai-workout-plan-service.ts`、`lib/server/exercise-recommendations/ai-exercise-recommendation-service.ts` 引用，使 `app/api` 既像路由入口又像服务端配置模块。

这次变更是架构边界重构，不应改变用户可见行为。核心约束是保持 `/api/chat`、训练计划草稿生成、动作推荐卡片、trigger JSON 协议、AI Trace 合并语义和模型调用次数稳定。

## Goals / Non-Goals

**Goals:**

- 让 `app/api/chat/route.ts` 只承担 HTTP 入口职责：读取配置、解析请求、创建 trace、调用服务端编排服务、映射响应和错误。
- 将聊天意图解析、上下文选择、动作候选上下文、assistant action 推导、system prompt 构造和 DeepSeek 请求封装到 `lib/server/chat/*`。
- 将 `aiPromptConfig` 移到服务端 AI 配置边界，避免 `lib/server/*` 反向依赖 `app/api/*`。
- 保留现有 `conversationContext`、候选动作注入、`canTriggerAction`、`missingActionFields`、suggested replies 和 trace step 的语义。
- 为后续继续抽离 `/api/ai/workout-plan` 和 `/api/ai/exercise-recommendations` 的编排边界提供一致模式。

**Non-Goals:**

- 不改变 AI prompt 内容、模型参数、模型调用次数、输出 Schema 或 trigger JSON 协议。
- 不改变前端 `features/chat/*`、推荐卡片、训练计划卡片和聊天历史的用户流程。
- 不新增鉴权、限流、成本控制、数据库结构、Prisma Schema 或持久化模型。
- 不切换模型提供方，不引入 Vercel AI SDK、LangGraph 或新的第三方依赖。
- 不在本次变更中全面重写所有 `app/api/*` 路由。

## Decisions

### 1. Route Handler 保持薄入口

`app/api/chat/route.ts` 应保留 `POST(request: Request)` 入口，并只做以下工作：

- 读取和检查 `DEEPSEEK_API_KEY` 等运行时配置。
- 解析 JSON body，并使用导出的请求 Schema 做 HTTP 入参校验。
- 创建 `/api/chat` 顶层 AI Trace。
- 调用 `lib/server/chat` 中的聊天编排服务。
- 将服务返回的成功流、失败码、错误详情映射为 `Response` 或 `jsonApiError`。

理由：`app/api` 是 Next.js 路由边界，不应成为业务流程的主要承载位置。把编排逻辑下沉后，服务端流程可以被单元测试覆盖，也可以被后续 Server Action、后台任务或调试工具复用。

备选方案是在 `route.ts` 内继续拆本地函数。这个方案移动少，但仍然把业务编排锁在路由文件中，无法解决 `app/api` 边界膨胀的问题。

### 2. 聊天编排模块按步骤拆分，但先保持单一服务入口

新增或整理 `lib/server/chat/*` 时，建议先暴露一个稳定入口，例如 `handleAiChatRequest()` 或 `createChatCompletionStream()`，内部再按职责拆分：

- `chat-request-schema.ts`：聊天请求 Schema 和输入类型。
- `chat-intent-service.ts`：意图解析 Schema、模型 JSON 请求和 fallback。
- `chat-exercise-context-service.ts`：动作库读取、候选筛选、`providedExercises` 映射。
- `chat-response-service.ts`：system prompt 构造、流式模型请求和流事件编码。
- `chat-actions.ts`：`assistantAction`、suggested replies 可见性等确定性规则。

实际实现可以按改动规模合并为更少文件，但不应继续把这些职责留在 `route.ts`。确定性规则优先放在可测试纯函数中；访问外部模型、数据库或环境变量的逻辑留在服务端模块中。

备选方案是一次性抽出通用 AI orchestrator。这个方向长期可能有价值，但当前只有聊天、计划生成和推荐三条主要链路，过早建立泛化 orchestrator 容易增加抽象成本。

### 3. `aiPromptConfig` 属于服务端 AI 配置

将 `app/api/ai-prompt-config.ts` 移到 `lib/server/ai/prompt-config.ts`。如果未来其中存在可安全共享的纯 prompt 常量，也应先由服务端模块导出，而不是让 `lib/server/*` 从 `app/api/*` 引入。

理由：prompt 配置服务于模型调用，不是 HTTP 路由。当前 `lib/server/workout-plans/*` 和 `lib/server/exercise-recommendations/*` 反向引用 `app/api`，会模糊 App Router 路由层和服务端服务层之间的依赖方向。

备选方案是放到 `lib/shared/ai/prompt-config.ts`。由于 prompt 内容直接服务服务端模型调用，且后续可能混入模型、成本、trace 或服务端环境约束，默认放入 `lib/server/ai` 更稳妥。

### 4. 先保行为，再调整测试观察点

本次重构不应重写 prompt，也不应改变 `selectMessagesForAiContext(..., { maxMessages: 16 })`、`conversationContext` fallback、candidate status、trace step 名称和 token usage 展示语义。实现时可以移动代码和拆类型，但必须保持以下观察点稳定：

- `/api/chat` 请求体校验和错误码。
- 用户可见流式回复事件格式。
- `done` 事件里的 `traceId`。
- 下游 workout plan 和 exercise recommendations 的 `parentTraceId` 传递能力。
- 触发动作推荐、单次训练和长期计划的内部 action 语义。

如果必须重命名内部 trace step，应同步评估 `/dev/ai-traces` 是否依赖 step 名称，并在 tasks 中显式验证。

## Risks / Trade-offs

- [Risk] 移动聊天编排逻辑时可能改变模型调用次数或请求参数。→ Mitigation: 迁移前后对照 trace step、model request 输入和 `include_usage` 配置，测试覆盖请求参数构造。
- [Risk] 抽离流式响应时可能破坏前端逐字读取或 `done` 事件。→ Mitigation: 保留现有 stream event 编码格式，并用集成测试或手动 trace 验证流事件。
- [Risk] 移动 `aiPromptConfig` 会造成遗漏引用或循环依赖。→ Mitigation: 统一从 `lib/server/ai/prompt-config.ts` 导入，运行 TypeScript 检查并用 `rg` 确认没有旧路径残留。
- [Risk] 一次性拆太多文件会让重构难以 review。→ Mitigation: 以服务入口和职责边界为准，允许内部文件数量按现有代码规模收敛，不为形式拆分。
- [Risk] 将 prompt 配置放入 `lib/server` 后，客户端如果未来需要展示 prompt 调试信息会不能直接引用。→ Mitigation: 调试页面通过服务端 API 暴露必要只读信息，不让客户端直接依赖服务端 prompt 模块。

## Migration Plan

1. 新增 `lib/server/ai/prompt-config.ts`，迁移 `aiPromptConfig`，更新所有引用，删除旧 `app/api/ai-prompt-config.ts`。
2. 在 `lib/server/chat/*` 建立聊天请求 Schema、意图解析、候选动作上下文、assistant action 和流式响应服务。
3. 将 `app/api/chat/route.ts` 改为薄入口，并保留现有 HTTP 契约和 trace 顶层创建位置。
4. 补充服务端测试，覆盖请求校验、意图解析 fallback、候选动作注入、流事件编码和错误映射。
5. 运行 `npm run typecheck`、`npm run lint`，并按需读取 AI Trace 验证模型调用次数和 trace 结构。

回滚策略：由于外部 API 契约不变，如果抽离后出现问题，可以临时把 `route.ts` 改回调用旧本地函数；但 `aiPromptConfig` 的新位置建议保留，避免继续产生反向依赖。

## Open Questions

无需要产品确认的问题。实现时如果发现某些 prompt 配置确实需要跨端展示，应新增服务端只读调试接口，而不是把 prompt 配置移入 `lib/shared`。
