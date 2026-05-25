## Why

当前聊天接口和 AI prompt 配置的目录边界不够清晰：`app/api/chat/route.ts` 同时承担 HTTP 入口、AI 意图解析、上下文组装、候选动作注入和流式响应编排；`app/api/ai-prompt-config.ts` 被 `lib/server/*` 反向引用，容易让 `app/api` 从路由入口层变成通用服务层。随着聊天编排、AI Trace、计划生成和推荐卡片继续扩展，这种边界会提高维护成本，也会让服务端逻辑难以复用和测试。

## What Changes

- 将 `/api/chat` 的 Route Handler 收敛为 HTTP 入参校验、权限上下文、调用服务端编排服务、返回流式响应和错误映射。
- 将聊天意图解析、会话上下文整理、动作候选注入、模型请求组装、AI Trace 步骤记录等流程迁移到 `lib/server/chat/*` 或更明确的服务端 AI 编排模块。
- 将 `app/api/ai-prompt-config.ts` 移出 `app/api`，放入服务端 AI 配置边界，例如 `lib/server/ai/prompt-config.ts`；服务端 AI 服务统一从新位置引用。
- 保持现有 API URL、前端调用方式、模型调用次数、trace 语义、trigger JSON 协议和用户可见聊天行为不变。
- 不引入新的 AI 能力、数据库结构、鉴权方案、第三方依赖或用户流程变化。

## Capabilities

### New Capabilities

- `api-layer-boundaries`: 约束 Next.js `app/api` Route Handler、`lib/server` 服务端编排模块、AI prompt 配置模块和前端 `features` 模块之间的职责边界。

### Modified Capabilities

无。

## Impact

- 影响 `app/api/chat/route.ts` 的职责范围和内部调用结构。
- 影响 `app/api/ai-prompt-config.ts` 的位置，以及 `app/api/chat/route.ts`、`lib/server/workout-plans/ai-workout-plan-service.ts`、`lib/server/exercise-recommendations/ai-exercise-recommendation-service.ts` 等引用路径。
- 可能新增 `lib/server/chat/*`、`lib/server/ai/*` 或相近模块，用于承载聊天编排与 AI prompt 配置。
- 不改变 `/api/chat`、`/api/ai/workout-plan`、`/api/ai/exercise-recommendations` 的外部 HTTP 契约。
- 需要补充或调整服务端编排层测试，至少覆盖意图解析、候选动作注入、上下文传递、trace id 传递和错误降级路径。
