# FitMate AI 当前技术架构

本文记录当前仓库真实架构，不作为未来推荐方案清单。若需要看本地启动、部署或目录索引，分别参考：

- [本地开发指南](./本地开发指南.md)
- [项目部署指南](./项目部署指南.md)
- [项目结构说明](./项目结构说明.md)
- [AgentLoop 架构设计](./agent-tool-orchestrator-design.md)
- [Prompt 设计规范](./llm-prompt-guidance.md)

## 1. 项目定位

FitMate AI 是一个 AI 健身聊天助手。系统通过自然语言理解用户训练目标、可用时间、器械条件、身体限制和训练偏好，并结合数据库中的动作事实生成可展示、可校验的训练建议。

当前产品已经形成这些业务闭环：

- 首页 AI 聊天、历史会话、流式回复和建议问题。
- `visibleTrainingProposal` 训练方案卡片展示。
- 动作库搜索、筛选、详情和图片展示。
- 动作编排、训练计划、训练日历和训练执行。
- 本地匿名用户、用户数据隔离和软删除。
- AI trace 调试台和只读 `/admin` AI usage 后台。

当前仍不是完整正式账号体系，也不是让模型直接执行写操作的 Agent 产品。训练保存、日历安排和训练执行仍由页面业务入口完成。

## 2. 总体架构

当前项目是 Next.js 单体模块化架构，按前端功能、API Route、服务端领域服务、AI 编排、共享 Schema 和数据库持久化分层。

```txt
Browser
  ↓
Next.js App Router 页面
  ↓
features/* 前端功能模块
  ↓
app/api/* Route Handlers
  ↓
lib/server/* 服务端服务
  ↓
Prisma Client
  ↓
PostgreSQL
```

生产聊天链路单独经过 Agent runtime：

```txt
POST /api/chat
  ↓
requireCurrentUser()
  ↓
prepareChatRequest()
  ↓
createAgentTextChatResponse()
  ↓
createProductionToolRegistry()
  ↓
LlmPlanner + DeepSeekModelAdapter
  ↓
runAgentRuntime()
  ↓
terminal output validator / visible output renderer
  ↓
NDJSON events
  ↓
visibleTrainingProposal facts + AI token usage summary + AI trace
```

## 3. 当前技术栈

| 层级 | 当前实现 |
|---|---|
| 前端应用 | Next.js 16 App Router、React 19、TypeScript 5 |
| UI 与样式 | Tailwind CSS 4、shadcn/ui 风格组件、Radix UI、Material Symbols、lucide-react、Sonner |
| API 层 | Next.js Route Handlers |
| 服务端业务 | TypeScript service layer，集中在 `lib/server/*` |
| 数据库 | PostgreSQL 17 |
| ORM | Prisma 7、`@prisma/adapter-pg`、`pg` |
| 校验 | Zod、JSON Schema、服务端 terminal output validator |
| AI 编排 | 自研 `agent-core`、`PlannerPort`、`ToolRegistry`、DeepSeek Chat Completions adapter |
| 测试 | Vitest、ESLint、`tsc --noEmit`、手动 LLM 黑盒测试入口 |
| 部署 | Next.js standalone、Docker、Docker Compose、Caddy、GitHub Actions、GHCR |

当前仓库没有接入 Redis、BullMQ、Inngest、Auth.js、Clerk、外部 Vector DB、S3/R2、Vercel AI SDK 或 OpenAI SDK 作为生产主链。

## 4. 前端应用层

前端页面入口在 `app/`：

```txt
app/(main)/page.tsx            # 首页聊天
app/(main)/composer/page.tsx   # 动作编排
app/(main)/exercises/page.tsx  # 动作库
app/(main)/plans/page.tsx      # 训练计划
app/(main)/settings/page.tsx   # 设置
app/training/page.tsx          # 训练执行
app/admin/page.tsx             # 只读后台
app/dev/ai-traces/page.tsx     # AI trace 调试台
```

前端功能代码按业务放在 `features/*`：

- `features/chat/`：聊天页面、流式读取、会话历史、建议问题、训练方案卡片适配。
- `features/exercises/`：动作库页面、动作详情、动作图片展示。
- `features/workouts/`：动作编排、训练计划、训练执行、语音播报。
- `features/workout-plans/`：训练草稿到 routine 的转换和日程派生。

前端层的边界：

- 可以引用 `components/ui/*`、`components/app/*`、`lib/client/*`、`lib/shared/*`。
- 不直接引用 `lib/server/*`。
- 不直接访问数据库或 AI 服务。
- 异步请求通过前端 API client 进入 `app/api/*`。

## 5. API 层

当前 API Route Handler 包括：

```txt
app/api/auth/local-anonymous/route.ts
app/api/chat/route.ts
app/api/chat/conversations/route.ts
app/api/chat/conversations/[id]/route.ts
app/api/exercises/route.ts
app/api/exercises/[id]/route.ts
app/api/exercise-images/[...path]/route.ts
app/api/workout-routines/route.ts
app/api/workout-routines/[id]/route.ts
app/api/workout-schedules/route.ts
app/api/workout-schedules/[id]/route.ts
app/api/workout-schedules/[id]/result/route.ts
app/api/admin/ai-usage/route.ts
app/api/dev/ai-traces/route.ts
```

API 层职责：

- 解析 HTTP request。
- 使用 Zod 校验客户端输入。
- 通过 `requireCurrentUser(request)` 建立当前用户上下文。
- 调用 `lib/server/*` 服务。
- 返回 JSON、NDJSON 或受控错误。

API 层不承载复杂业务逻辑，不直接把客户端传入的裸 `userId` 作为权限依据。

## 6. 用户与权限边界

当前身份体系是本地匿名 auth cookie。

- `POST /api/auth/local-anonymous` 用于创建或恢复匿名身份。
- 浏览器通过 HttpOnly cookie 自动携带身份。
- 私有 API Route Handler 通过 `requireCurrentUser(request)` 恢复请求级 `CurrentUser`。
- 服务端查询必须以 `currentUser.id` 做用户隔离。
- `DELETE /api/auth/local-anonymous` 会清除当前 cookie 并软删除旧用户。

数据库中相关模型包括：

- `User`
- `UserIdentity`
- `UserProfile`
- `UserMemory`
- `UserExerciseFeedback`

`UserProfile`、`UserMemory` 和 `UserExerciseFeedback` 已有数据结构和部分服务，但正式用户画像管理流程还不是完整产品能力。

## 7. 服务端业务层

服务端代码集中在 `lib/server/*`。核心模块如下：

| 模块 | 职责 |
|---|---|
| `auth/` | 本地匿名 auth cookie 与当前用户恢复 |
| `chat/` | 聊天请求归一化、历史 hydration、Agent 文本流接入、终态失败收口 |
| `agent-core/` | Agent runtime、tool registry、resource store、policy guard、response renderer、trace audit |
| `agent-planners/` | LLM planner 与 DeepSeek model adapter |
| `agent-tools/` | 生产只读业务 tool 和 fixture tool |
| `config/` | Agent runtime、LLM prompt、输出合同等集中配置 |
| `db/` | Prisma Client 单例和数据库配置 |
| `exercises/` | 动作库查询、结构化过滤、facet catalog 和动作事实投影 |
| `exercise-images/` | 动作图片本地路径解析和公开 URL 派生 |
| `visible-training-proposals/` | 可见训练方案合同、校验、渲染和跨 run 事实保存 |
| `workouts/` | routine、schedule、session result 持久化服务 |
| `admin/` | 只读后台数据投影 |
| `usage/` | AI token usage summary 写入 |
| `user-feedback-memory/` | 用户偏好、动作反馈和记忆服务 |

服务端业务层负责确定性边界：Schema、权限、数据库事实、动作 ID 校验、resource 引用、输出渲染、成本统计和错误恢复。

## 8. 共享类型与 Schema

`lib/shared/*` 只放前后端都可安全使用的类型、Schema 和纯函数。

主要共享模块：

- `lib/shared/chat/`
- `lib/shared/exercises/`
- `lib/shared/workouts/`
- `lib/shared/workout-plans/`
- `lib/shared/conversation-artifacts/`
- `lib/shared/exercise-recommendations/`
- `lib/shared/policy-confirmation/`
- `lib/shared/user-feedback-memory/`

典型职责：

- 聊天上下文和会话摘要结构。
- 动作、训练 routine、训练日历和训练执行 DTO。
- 训练执行 timeline、估时、组数和热身/主训练/拉伸 section 规则。
- 前后端共用 Zod Schema。

共享层不放数据库访问、环境变量、外部 API key、服务端权限逻辑或浏览器状态。

## 9. 数据与持久化层

PostgreSQL 是运行时事实数据源，Prisma 是唯一 ORM 边界。`data/exercises.zh.json` 只作为动作 seed 来源。

当前核心模型：

| 模型 | 职责 |
|---|---|
| `User` / `UserIdentity` | 本地匿名用户和后续身份扩展基础 |
| `UserProfile` | 用户目标、经验、频率、器械、偏好等结构化资料 |
| `Exercise` | 动作库事实、肌群、器械、图片、发布态、embedding 字段 |
| `UserMemory` / `UserExerciseFeedback` | 用户偏好、动作反馈和长期记忆 |
| `WorkoutRoutine` / `WorkoutRoutineItem` | 用户保存的训练 routine 和动作项 |
| `WorkoutSchedule` | 日历上的训练安排或休息日 |
| `WorkoutSessionResult` | 一次训练完成摘要 |
| `ChatSession` / `ChatMessage` | 聊天会话和消息 |
| `ConversationArtifact` / `ArtifactIndex` | 对话产物和索引投影 |
| `ConversationBusinessFact` | 跨 run 的轻量业务事实 |
| `AiTokenUsageSummary` | 生产聊天 token 汇总，独立于 trace |

时间字段约定：

- 具体时间点使用 `@db.Timestamptz(3)`。
- 服务端 DTO、API 响应、AI trace 和持久化 JSON 中的新具体时间点使用 ISO 8601 UTC `Z` 字符串。

## 10. 动作与训练业务架构

动作库事实来自 PostgreSQL `Exercise` 表。服务端动作查询在 `lib/server/exercises/*` 中完成，负责：

- 发布态过滤。
- 结构化 facet 过滤。
- 动作详情和列表投影。
- 动作图片 URL 派生。
- `searchExerciseResources` tool 的动作事实来源。

训练业务由 `lib/server/workouts/workout-persistence-service.ts` 承接：

- `WorkoutRoutine` 表示用户保存的一套动作编排。
- `WorkoutSchedule` 表示日历安排或休息日。
- `WorkoutSessionResult` 保存一次训练完成摘要。
- 保存 routine 前会校验动作 ID 存在。
- 前端训练执行状态主要在浏览器侧运行，结束后把摘要结果写回服务端。

训练计划卡片和动作推荐展示不等于已保存 routine。用户仍需要通过页面交互保存或安排训练。

## 11. AI / Agent 架构

### 11.1 Agent runtime

`lib/server/agent-core/*` 是模型无关的 Agent 执行内核，包含：

- `contracts.ts`：Agent action、tool、resource、trace 等核心合同。
- `runtime.ts`：Agent 主循环。
- `tool-registry.ts`：tool 注册表。
- `resource-store.ts`：resource 注册和读取边界。
- `policy-guard.ts`：策略与确认边界。
- `terminal-output-validator.ts`：终态输出校验。
- `response-renderer.ts` / `visible-output-renderer.ts`：用户可见响应渲染。
- `manifest.ts` / `manifest-hardening.ts`：模型可见 tool manifest。
- `redaction.ts` / `trace-audit.ts`：trace 脱敏和审计。

Agent runtime 只处理确定性合同，不基于用户原文关键词或短句模板改写模型意图。

### 11.2 Planner 与模型适配

生产聊天使用：

```txt
LlmPlanner
  +
DeepSeekModelAdapter
```

`createProductionAgentTextChatPlanner()` 从环境变量读取：

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_API_URL`
- `DEEPSEEK_MODEL`

缺少 `DEEPSEEK_API_KEY` 时，`/api/chat` 返回稳定配置错误 `chat_ai_not_configured`。

Agent runtime、模型 token、超时、tool 返回数量等预算集中在 `lib/server/config/agent-runtime-config.ts`。

### 11.3 生产 tool 白名单

当前生产聊天只注册低风险只读业务 tool：

```txt
inspectVisibleTrainingProposals
resolveExerciseResourceMentions
searchExerciseResources
```

它们分别用于：

- 读取当前用户当前会话已展示的 `visibleTrainingProposal` 业务事实。
- 把用户明确点名动作解析为受控发布态 Exercise 候选。
- 查询 section-scoped 的发布态动作事实。

fixture tool、写入型 tool、训练保存 tool、训练执行 tool 不进入生产聊天主链。

### 11.4 可见训练方案输出

`visibleTrainingProposal` 是当前训练结构化输出合同。

服务端链路：

```txt
模型 final_answer.visibleOutputs[]
  ↓
visibleTrainingProposalPayloadSchema
  ↓
validateVisibleTrainingProposalOutput()
  ↓
数据库动作事实校验
  ↓
visibleTrainingProposal renderer
  ↓
前端训练方案卡片
  ↓
ConversationBusinessFact 持久化为后续轮次可读取事实
```

正文不是动作事实源。训练动作必须来自数据库，并且最终展示前必须通过服务端校验。

### 11.5 失败收口、trace 与 usage

主 Agent 失败后，`terminal-failure-finalizer` 可在受控预算内生成用户可见失败解释和建议问题；如果 finalizer 不可用，则返回确定性 fallback。

AI trace 用于开发和内测诊断：

- 记录 run 输入摘要。
- 记录 planner request/response。
- 记录 tool execution。
- 记录 token usage 和终态决策。
- 生产环境只有 `ENABLE_AI_TRACE_LOG=true` 时写入。

生产 token 统计写入 `AiTokenUsageSummary`，不依赖 trace、内存 store 或 `ChatMessage.metadata` 推断。

## 12. 部署架构

当前部署方式是 Docker + Caddy + GitHub Actions：

```txt
Dockerfile
  -> runner target: Next.js standalone app
  -> ops target: Prisma migration / seed / refresh embeddings

deploy/server/docker-compose.yml
  -> caddy
  -> app
  -> db
  -> ops profile: migrator / seed / refresh_embeddings

.github/workflows/deploy.yml
  -> build runner / ops images
  -> push GHCR
  -> sync compose and Caddyfile
  -> run migrator
  -> recreate app
  -> verify runtime image
```

本地 `compose.yaml` 只启动 PostgreSQL，不包含 Next.js app。

服务器生产 `.env` 只保存在 `/opt/fitmate/.env`，GitHub Actions 不覆盖真实 `.env`，只更新 `APP_IMAGE` 和 `OPS_IMAGE`。

## 13. 当前未接入能力

以下能力不是当前生产架构事实，不应在实现或排查时当成已存在依赖：

- 正式账号登录、OAuth、Auth.js、Clerk。
- Redis、BullMQ、Inngest 或独立后台队列。
- 外部 Vector DB 或 PostgreSQL `pgvector` 扩展；当前 `Exercise.embedding` / `ArtifactIndex.embedding` 是 JSON 字段。
- S3、Cloudflare R2、Supabase Storage；当前动作图片默认走本地目录和站内 route。
- Vercel / Neon / Supabase / Railway 托管部署主链。
- OpenAI SDK / Vercel AI SDK 生产主链。
- 模型直接保存、覆盖或执行训练计划的写入型 tool。
- AI 医疗诊断或治疗建议。

## 14. 架构原则

- UI 层、API 层、服务端领域服务、AI 编排和数据库访问保持职责分离。
- API Route Handler 不堆复杂业务逻辑。
- 前端不直接访问数据库或 AI 服务。
- 所有用户私有数据查询都基于 `CurrentUser.id` 隔离。
- 所有客户端输入使用 Zod 或等价 Schema 校验。
- 所有模型结构化输出在保存或展示前经过服务端校验。
- 运行时配置、模型参数、限额、超时、tool 返回数量等集中放在 `lib/server/config/*`。
- 服务端不基于用户自然语言关键词、正则或短句模板替代模型做语义分流。
- PostgreSQL 是系统事实来源，AI 输出不能绕过数据库事实和权限边界。

## 15. 后续演进方向

后续演进应基于当前单体模块化边界逐步推进，不需要先拆微服务。

优先级更高的方向：

- 正式账号体系和用户数据迁移。
- 用户画像管理闭环。
- 生产 Agent 写入型 tool 的 policy、confirmation 和持久化合同。
- 动作库内容后台和质量审核。
- 更完整的训练反馈和个性化调整。
- 成本、限流和观测体系加强。

这些方向都应先通过 OpenSpec 明确合同和边界，再进入实现。
