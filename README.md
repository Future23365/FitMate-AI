# FitMate AI

FitMate AI 是一个基于 Agent 编排的 AI 健身聊天助手。系统通过自然语言理解用户的训练目标、可用时间、器械条件、身体限制和训练偏好，并结合数据库中的动作事实生成可展示、可校验的训练建议。

项目采用 Next.js App Router + React + TypeScript 构建前端体验和 API Route，使用 PostgreSQL / Prisma 作为事实数据源。动作库、聊天历史、训练编排、训练日历、训练执行状态和可见训练方案事实均持久化到数据库；AI 链路通过自研 `agent-core` 接入 DeepSeek planner，生产环境只开放受控只读 tool 查询动作资源和历史可见训练事实，模型输出会经过服务端结构校验、数据库事实校验和 response renderer 后再展示给用户。

当前已实现 AI 聊天、训练方案卡片、动作库搜索筛选、训练编排、训练日历、训练执行、动作图片本地解析、AI trace 调试和自动化测试体系。当前身份体系仍是本地匿名 auth cookie，不是正式账号登录体系；生产 Agent 也尚未开放直接保存、覆盖或执行训练计划的写入型 tool。

## 当前状态

当前项目主要完成了以下能力：

- 首页聊天界面支持历史会话、本地匿名用户、流式回复、Agent 活动状态、建议问题和 `visibleTrainingProposal` 用户可见训练方案卡片。
- 生产 `/api/chat` 通过 `agent-core`、DeepSeek planner、受控只读 tool 查询和 Response Renderer 生成 NDJSON 响应，并把已展示的可见训练方案事实保存为后续轮次可读取的业务事实。
- 当前生产 Agent 可见 tool 白名单包含 `inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions` 和 `searchExerciseResources`，只用于读取或解析动作资源与可见训练事实，不包含写入、保存、覆盖或训练执行 tool。
- 动作库页面，基于 PostgreSQL/Prisma 动作 repository 展示、搜索、筛选动作。
- 动作编排页面，支持从动作库添加动作、调整组数/次数/休息，并保存到数据库。
- 训练日历页面，支持数据库持久化安排训练、设置休息日、标记完成/未完成。
- 训练执行页面，支持倒计时、动作切换、暂停、结束训练，并同步训练完成状态。
- 基础响应式 UI、Tailwind CSS 主题和侧边栏导航。
- 前端页面与服务端业务代码已分离：`features/` 承载前端功能模块，`lib/server/` 承载服务端服务，`lib/shared/` 承载共享类型和 Schema。

注意：运行时数据以 PostgreSQL 为事实来源，本地运行和服务器部署都必须配置 `DATABASE_URL` 并执行迁移；`data/exercises.zh.json` 只作为动作 seed 来源，不再作为运行时数据回退。当前身份体系是本地匿名 auth cookie，适合单用户或内测部署，不等同于正式账号登录体系。

## 核心方案

- `agent-core` 是模型无关的 Agent 执行内核，负责 action schema、tool registry、resource store、policy guard、terminal output validation、trace 和 response rendering；DeepSeek 只在 `agent-planners` adapter 层接入。
- 生产 Agent tool 采用白名单机制，当前只注册 `inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions` 和 `searchExerciseResources`；fixture tool、写入型 tool 和训练执行 tool 不进入生产聊天主链。
- `visibleTrainingProposal` 是统一的用户可见训练方案输出。模型生成后必须经过服务端 validator 校验动作 ID、发布态、section coverage 和数据库事实，再由 renderer 转成前端卡片事件。
- 动作检索以 PostgreSQL/Prisma 为主，使用结构化过滤和本地 `embeddingText` / `embedding` 辅助检索，不依赖独立向量数据库。
- 服务端只处理确定性边界：Schema、权限隔离、数据库事实、resource 引用、grounding、限流预算和错误恢复；不基于用户原文关键词或短句模板改写模型意图。
- AI trace 调试台记录 Agent run、planner request/response、tool execution、token usage 和终态决策，便于复盘真实聊天链路。

## 技术栈

- 前端框架：Next.js 16 App Router、React 19、TypeScript。
- UI 与样式：Tailwind CSS 4、shadcn/ui 风格组件、Radix UI、Material Symbols、lucide-react、Sonner。
- 服务端与数据：Next.js Route Handlers、PostgreSQL、Prisma 7、`@prisma/adapter-pg`、`pg`。
- AI 编排：自研 `agent-core`、`PlannerPort`、`ToolRegistry`、DeepSeek Chat Completions adapter。
- 数据校验：Zod、JSON Schema、服务端 terminal output validator。
- 内容与资源：本地 JSON 动作 seed 数据、动作图片本地目录 / CDN 基础 URL、Next image optimizer。
- 测试与验证：Vitest、ESLint、TypeScript `tsc --noEmit`、独立手动 LLM 黑盒测试入口、前端性能分析脚本。

## 本地运行

安装依赖：

```bash
npm install
```

配置环境变量：

```bash
cp .env.example .env.local
```

在 `.env.local` 中填写：

```bash
DATABASE_URL="postgresql://fitmate:fitmate@localhost:5432/fitmate?schema=public"
DEEPSEEK_API_KEY=
FITMATE_LOCAL_AUTH_SECRET=
CONFIRMATION_TOKEN_SECRET=
EXERCISE_IMAGE_LOCAL_DIR="exercises_picture"
EXERCISE_IMAGE_PUBLIC_BASE_URL="/api/exercise-images"
DEEPSEEK_MODEL=
DEEPSEEK_API_URL=
ENABLE_AI_TRACE_LOG=
```

环境变量说明：

- `DATABASE_URL`：PostgreSQL 连接串，服务端运行、Prisma CLI、seed 和搜索 embedding 刷新都依赖它。当前 Prisma 7 基线通过 `prisma.config.ts` 读取连接串，运行时通过 `@prisma/adapter-pg` 创建 `PrismaClient`。
- `DEEPSEEK_API_KEY`：生产 `/api/chat` 和手动 LLM 黑盒测试需要的模型 API key；缺少时聊天接口会返回稳定的 `chat_ai_not_configured` 配置错误。
- `FITMATE_LOCAL_AUTH_SECRET`：用于签发和校验本地匿名 auth cookie。生产环境必须显式配置；本地开发未配置时会使用固定开发 fallback，方便重启后继续验证同一浏览器匿名会话。
- `CONFIRMATION_TOKEN_SECRET`：用于签名高影响操作确认 token。当前生产 Agent 尚未开放写入型 tool，但服务器部署仍应显式配置，避免使用开发 fallback。
- `EXERCISE_IMAGE_LOCAL_DIR`：动作图片本地目录，默认值为 `exercises_picture`。
- `EXERCISE_IMAGE_PUBLIC_BASE_URL`：动作图片对前端暴露的基础 URL，默认值为 `/api/exercise-images`。
- `DEEPSEEK_MODEL`：可选，覆盖集中配置中的默认模型；未配置时默认使用 `deepseek-v4-flash`。
- `DEEPSEEK_API_URL`：可选，覆盖 DeepSeek Chat Completions endpoint；未配置时使用官方默认地址。
- `ENABLE_AI_TRACE_LOG`：可选，生产环境设为 `true` 时允许写入 AI trace 调试数据；不要在公开环境长期打开。

动作图片本地资源配置：

- `exercises_picture/` 是默认动作图片目录，可通过 `npm run db:download-exercise-images` 从数据库中的原始 `Exercise.imageUrls` 下载生成。
- `EXERCISE_IMAGE_LOCAL_DIR` 默认值为 `exercises_picture`，支持填写相对项目根目录的路径或绝对路径。
- `EXERCISE_IMAGE_PUBLIC_BASE_URL` 默认值为 `/api/exercise-images`，前端会收到该基础 URL 下的展示地址；如果迁移到 CDN、对象存储或站内静态目录，可改成对应绝对 URL 或站内路径。
- 数据库中的 `Exercise.images` / `Exercise.imageUrls` 保留原始来源语义，服务端会在动作库、推荐卡和训练执行读取链路中统一派生当前可展示 URL。
- 本地动作图片默认交给 Next image optimizer 做尺寸和格式优化；列表和小卡片应继续使用 `next/image` 的 `sizes` 约束，不直接请求原始大图。

`DEEPSEEK_MODEL` 未配置时，生产聊天默认使用集中配置中的 `deepseek-v4-flash`，并由首页请求的 `thinkingEnabled` 控制 DeepSeek Thinking Mode。

启动本地 PostgreSQL：

```bash
docker compose up -d postgres
```

初始化 Prisma Client、数据库表和动作 seed 数据：

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:refresh-embeddings
```

数据库时间字段约定：

- `prisma/schema.prisma` 中表示具体时间点的 `DateTime` 字段统一显式映射为 `@db.Timestamptz(3)`。
- 已有无时区 timestamp 数据按 UTC+0 解释，通过新增 forward migration 转换，不改写历史 migration。
- 服务端 DTO、API 响应、AI trace 和持久化 JSON 中的新具体时间点统一输出 ISO 8601 UTC `Z` 字符串；日期型训练日历 key 从 UTC 零点派生。

启动开发服务：

```bash
npm run dev
```

常用命令：

```bash
npm test
npm run test:llm:basic -- --help
npm run typecheck
npm run lint
npm run build
npm run perf:frontend
docker compose ps
docker compose stop postgres
docker compose down
```

## 服务器部署

部署前建议使用 Node.js `^22.12` 或更高版本。Next.js 当前包声明 `node >=20.9.0`，Prisma 7 当前包声明 `node ^20.19 || ^22.12 || >=24.0`，使用 Node 22 LTS 能同时满足两者要求。

当前仓库已提供 Docker + Caddy + GitHub Actions 部署配置：

- `Dockerfile`：包含 `runner` 和 `ops` 两个 target。`runner` 运行 Next.js standalone 应用；`ops` 保留 Prisma CLI、migration、seed 和 embedding 刷新脚本。
- `.dockerignore`：控制 Docker build 上下文，避免把 `.env`、`.env.local`、`node_modules`、`.next`、测试和调试产物打进镜像。
- `.github/workflows/deploy.yml`：推送到 `dev` 分支时构建 app / ops 两个 GHCR 镜像，通过 SSH 更新服务器并先执行 `prisma migrate deploy`。
- `deploy/server/docker-compose.yml`：服务器 `/opt/fitmate/docker-compose.yml` 模板，包含 `caddy`、`app`、`db` 和 `ops` profile 下的 `migrator` / `seed` / `refresh_embeddings`。
- `deploy/server/Caddyfile`：Caddy HTTPS 和反向代理模板，通过服务器 `.env` 中的 `DOMAIN` 注入域名。
- `deploy/server/.env.example`：服务器生产 `.env` 模板，真实 `.env` 只保存在服务器，不提交到 Git。

服务器首次准备时，将 `deploy/server/docker-compose.yml`、`deploy/server/Caddyfile` 和 `deploy/server/.env.example` 复制到 `/opt/fitmate/`，把 `.env.example` 改名为 `.env` 并填写真实值。GitHub Actions 需要配置 `SERVER_HOST`、`SERVER_PORT`、`SERVER_USER`、`SERVER_SSH_KEY` 这几个 Repository secrets。

首次上线或动作 seed 数据变化后，在服务器执行：

```bash
cd /opt/fitmate
docker compose --profile ops run --rm seed
docker compose --profile ops run --rm refresh_embeddings
```

本地或裸机排查仍可使用以下命令链路：

```bash
npm ci
npm run db:generate
npx prisma migrate deploy
npm run db:seed
npm run db:refresh-embeddings
npm run build
npm start
```

部署注意事项：

- 生产环境不要使用 `npm run db:migrate`；该脚本执行的是 `prisma migrate dev`，适合本地开发。服务器应使用 `npx prisma migrate deploy` 应用已提交的 migration。
- `npm start` 运行的是 `next start`，需要先执行 `npm run build`。
- `npm run db:seed` 会把 `data/exercises.zh.json` 写入 PostgreSQL；首次部署必须执行。后续如果动作 seed 数据没有变化，可以跳过。
- `npm run db:refresh-embeddings` 会刷新动作搜索使用的本地 embedding/hash 数据；首次部署和动作 seed 更新后需要执行。
- `exercises_picture/` 如果不随代码一起上传，需要在服务器上运行 `npm run db:download-exercise-images`，或把 `EXERCISE_IMAGE_PUBLIC_BASE_URL` 指向 CDN / 对象存储地址。
- 当前身份体系是本地匿名 cookie。生产环境必须配置稳定的 `FITMATE_LOCAL_AUTH_SECRET`，否则匿名会话无法安全持续；如果后续接入正式 OAuth / credentials 登录，需要同步更新本文档。
- 当前生产 Agent 只开放只读查询与可见训练方案输出，不会由模型直接保存或覆盖训练计划；用户仍需要通过页面已有训练编排、日历和执行入口保存或管理训练数据。

测试与验证命令：

- `npm test`：运行 Vitest 自动化测试，覆盖共享领域逻辑、服务边界、API Route 边界和前端请求转换；该命令永远不触发真实模型 API，不消费模型 token。
- `npm test -- tests/agent-core`：运行新的 Agent Tool core / fixture / hardening 测试；该命令同样不触发真实模型 API。
- `npm test -- tests/agent-core/architecture-boundary.test.ts tests/agent-core/contract-helper.test.ts tests/agent-core/tool-governance-regression.test.ts`：运行 Agent tool governance 架构扫描、contract helper 和关键安全回归。
- `npm run test:llm:basic`：手动运行基础首页聊天 LLM 黑盒测试，会真实调用模型并消费 token。支持 `--flow F01`、`--flow F01,F02` 和 `--report <path>`；详细说明见 [docs/manual-llm-basic-blackbox-tests.md](./docs/manual-llm-basic-blackbox-tests.md)。
- `npm run typecheck`：运行 TypeScript 静态类型检查。
- `npm run lint`：运行 ESLint 源码质量检查。
- `npm run build`：验证 Next.js 构建、路由和服务端/客户端模块边界。
- `npm run perf:frontend`：在完成生产构建后，从 `.next` client-reference manifest 汇总关键路由入口 JavaScript raw/gzip 大小和 chunk 清单，并统计本地动作图片资源体积。
- UI/交互或浏览器能力变更按任务要求和人工确认使用真实浏览器验证；默认检查优先使用类型检查、测试、lint 和构建。

## 目录说明

项目按 Next.js App Router 和前后端边界进行组织：

```txt
app/
  api/                     # Route Handlers，仅做 HTTP 入参/出参和服务层调用
    auth/local-anonymous/  # 本地匿名用户 cookie 签发与恢复
    chat/                  # 聊天请求接口；校验、历史 hydration 和 agent-core 文本流接入
    chat/conversations/    # 聊天会话历史读取
    dev/ai-traces/         # AI trace 调试数据接口
    exercises/             # 动作库查询接口
    exercise-images/       # 本地动作图片读取接口
    workout-routines/      # 训练 routine 持久化接口
    workout-schedules/     # 训练日历持久化接口
  (main)/                  # 主应用 shell route group，URL 不包含该目录名
    page.tsx               # 首页路由入口，渲染聊天功能模块
    composer/page.tsx      # 动作编排页路由入口
    exercises/page.tsx     # 动作库页路由入口
    plans/page.tsx         # 训练计划页路由入口
    settings/page.tsx      # 设置页路由入口
    layout.tsx             # 主应用侧栏和 route transition，只包裹常规应用页面
  training/page.tsx        # 训练执行页路由入口
  dev/ai-traces/page.tsx   # AI trace 调试台，生产环境默认不开放 trace 写入

components/
  app/                     # 跨功能复用的应用级 UI，如侧边栏、Logo、图标

.codex/
  skills/                  # 项目级 Codex Skills，用于固化 OpenSpec、Agent tool 与 Agent prompt 合同治理流程

features/
  chat/                    # 前端聊天功能模块
    api/                   # 浏览器侧 API client
    components/            # 聊天页面 UI
    hooks/                 # 聊天状态机和流式读取逻辑
    lib/                   # 聊天历史、计划触发解析等前端工具
    types.ts               # 聊天相关类型
  exercises/               # 前端动作库功能模块
  workouts/                # 前端训练编排、日历、执行相关页面组件
  workout-plans/           # 前端训练计划草稿转换为 routine 的工具

lib/
  client/                  # 浏览器专用基础设施
    http/client-request.ts # 前端统一请求函数
  server/                  # 服务端专用基础设施和业务服务
    agent-core/            # Agent runtime、tool registry、validator、resource store 和 response renderer
    agent-planners/        # LLM planner 与 DeepSeek model adapter
    agent-tools/           # 生产 Agent tool 白名单和 fixture tool 定义
    auth/                  # 本地匿名 auth cookie 与当前用户恢复
    chat/                  # 服务端聊天请求归一化、历史 hydration 和 agent-core 文本流接入
    config/                # Agent runtime、LLM prompt 和可见输出合同集中配置
    db/                    # Prisma Client 单例和数据库配置入口
    http/server-request.ts # 服务端外部 HTTP 请求函数
    exercises/             # 服务端动作库查询服务
    exercise-images/       # 动作图片本地路径解析和公开 URL 派生
    users/                 # 当前用户读取边界
    user-feedback-memory/  # 用户画像、偏好、反馈和记忆读取/写入服务
    visible-training-proposals/ # 可见训练方案校验、渲染和跨 run 事实保存
    workout-plans/         # AI 计划生成、候选动作、计划校验服务
    workouts/              # 训练 routine、schedule、session result 持久化服务
  shared/                  # 前后端共享类型、Schema 和纯数据结构
    exercises/
    workout-plans/
    workouts/

data/
  exercises.zh.json        # 中文动作 seed 数据；运行时动作事实以 PostgreSQL 为准

prisma/
  schema.prisma            # PostgreSQL/Prisma 数据模型；DateTime 统一使用 timestamptz 语义

scripts/                   # 数据初始化、动作图片下载、测试入口和性能分析脚本
tests/                     # Vitest 自动化测试
docs/                      # 架构、数据库设计与其他说明文档
example/                   # 设计参考 HTML
```

分层约定：

- `app/api/*` 不直接堆业务逻辑，复杂流程下沉到 `lib/server/*`。
- `features/*` 是前端功能模块，可以引用 `lib/client/*` 和 `lib/shared/*`，不应引用 `lib/server/*`。
- `lib/server/*` 是服务端专用代码，可以引用 `lib/shared/*`，不应引用 `lib/client/*`。
- `lib/shared/*` 只放前后端都可安全使用的类型、Schema 和纯函数，不放数据库、环境变量、外部 API 密钥或浏览器状态。
- `components/app/*` 只放跨功能复用的应用级 UI，页面级组件优先放在对应 `features/*/components` 中。

## 已知限制

- 当前身份体系是本地匿名 cookie，不是正式账号登录、权限后台或多端账号同步。
- 当前生产 Agent 只开放只读资源查询和可见训练方案输出，不开放由模型直接写入、保存、覆盖或执行训练计划。
- `UserProfile`、`UserMemory` 和 `UserExerciseFeedback` 的数据结构与服务已存在，但正式用户画像管理流程仍不是完整产品能力。
- AI trace 调试能力面向开发和内测；生产环境只有显式设置 `ENABLE_AI_TRACE_LOG=true` 时才写入 trace，公开部署应谨慎开启。
