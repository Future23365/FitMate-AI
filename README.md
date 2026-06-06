# FitMate AI

FitMate AI 是一个 AI 健身聊天助手原型。项目目标是通过自然语言交互理解用户的健身目标、身体状态、训练限制、训练偏好和可用时间，并据此生成、调整和执行个性化训练计划。

当前项目采用 Next.js App Router 构建，前端体验、API Route、领域规则、共享类型和 Prisma 数据模型已经按目录做了初步分层。动作库、聊天历史、训练编排、训练日历和训练执行状态已接入 PostgreSQL/Prisma；旧 AI/Agent 运行时已经下线，新的 `agent-core` 文本聊天和受控只读 tool 查询正在接入，当前仍缺少正式鉴权、用户画像管理和完整写入型 AI Tool Calling 闭环。

更完整的架构说明见 [docs/architecture.md](./docs/architecture.md)。当前数据库表结构、字段含义和关系说明见 [docs/database-design.md](./docs/database-design.md)，该文档根据已有数据库整理，仅用于帮助开发者理解当前设计，不作为数据库设计规范。

## 当前状态

当前项目主要完成了以下原型能力：

- 首页聊天界面保留历史会话、本地消息状态和卡片展示壳层；当前 `/api/chat` 通过新的 `agent-core` 生产文本流，支持 DeepSeek planner、受控只读 tool 查询和 `visibleTrainingProposal` 用户可见输出，写入/保存/执行训练计划能力仍未开放。
- 旧聊天 AI/Agent 主链、旧 tool registry、旧 Prompt、旧模型调用、旧 Agent stream 和手动 LLM runner 已删除。
- 动作库页面，基于 PostgreSQL/Prisma 动作 repository 展示、搜索、筛选动作。
- 动作编排页面，支持从动作库添加动作、调整组数/次数/休息，并保存到数据库。
- 训练日历页面，支持数据库持久化安排训练、设置休息日、标记完成/未完成。
- 训练执行页面，支持倒计时、动作切换、暂停、结束训练，并同步训练完成状态。
- 基础响应式 UI、Tailwind CSS 主题和侧边栏导航。
- 前端页面与服务端业务代码已分离：`features/` 承载前端功能模块，`lib/server/` 承载服务端服务，`lib/shared/` 承载共享类型和 Schema。

注意：当前仍是前端原型 + 动作 seed 数据 + 数据库领域服务阶段，尚未接入正式鉴权或新的 AI 工具调用闭环。运行时数据以 PostgreSQL 为事实来源，本地运行需要配置 `DATABASE_URL` 后执行迁移与 seed；`data/exercises.zh.json` 只作为动作 seed 来源，不再作为运行时数据回退。

## 技术栈

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL
- Zod
- 静态 JSON 动作 seed 数据

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
FITMATE_LOCAL_AUTH_SECRET=
EXERCISE_IMAGE_LOCAL_DIR="exercises_picture"
EXERCISE_IMAGE_PUBLIC_BASE_URL="/api/exercise-images"
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=
DEEPSEEK_API_URL=
```

`FITMATE_LOCAL_AUTH_SECRET` 用于签发和校验本地匿名 auth cookie。生产环境必须显式配置；本地开发未配置时会使用固定开发 fallback，方便重启后继续验证同一浏览器匿名会话。

动作图片本地资源配置：

- `exercises_picture/` 是默认动作图片目录，可通过 `npm run db:download-exercise-images` 从数据库中的原始 `Exercise.imageUrls` 下载生成。
- `EXERCISE_IMAGE_LOCAL_DIR` 默认值为 `exercises_picture`，支持填写相对项目根目录的路径或绝对路径。
- `EXERCISE_IMAGE_PUBLIC_BASE_URL` 默认值为 `/api/exercise-images`，前端会收到该基础 URL 下的展示地址；如果迁移到 CDN、对象存储或站内静态目录，可改成对应绝对 URL 或站内路径。
- 数据库中的 `Exercise.images` / `Exercise.imageUrls` 保留原始来源语义，服务端会在动作库、推荐卡和训练执行读取链路中统一派生当前可展示 URL。
- 本地动作图片默认交给 Next image optimizer 做尺寸和格式优化；列表和小卡片应继续使用 `next/image` 的 `sizes` 约束，不直接请求原始大图。

`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL` 和 `DEEPSEEK_API_URL` 用于新的 `agent-planners` DeepSeek adapter、生产 `/api/chat` 文本聊天和手动 LLM 黑盒测试；缺少 `DEEPSEEK_API_KEY` 时生产聊天会返回稳定的 `chat_ai_not_configured` 配置错误。`DEEPSEEK_MODEL` 未配置时，生产聊天默认使用集中配置中的 `deepseek-v4-flash`，并由首页请求的 `thinkingEnabled` 控制 DeepSeek Thinking Mode。

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
    chat/                  # 聊天请求接口；校验、历史 hydration 和 agent-core 文本流接入
    exercises/             # 动作库查询接口
  (main)/                  # 主应用 shell route group，URL 不包含该目录名
    page.tsx               # 首页路由入口，渲染聊天功能模块
    composer/page.tsx      # 动作编排页路由入口
    exercises/page.tsx     # 动作库页路由入口
    plans/page.tsx         # 训练计划页路由入口
    settings/page.tsx      # 设置页路由入口
    layout.tsx             # 主应用侧栏和 route transition，只包裹常规应用页面
  training/page.tsx        # 训练执行页路由入口

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
    chat/                  # 服务端聊天请求归一化、历史 hydration 和 agent-core 文本流接入
    db/                    # Prisma Client 单例和数据库配置入口
    http/server-request.ts # 服务端外部 HTTP 请求函数
    exercise-recommendation-facts/ # Agent 动作刷新跨 run 事实桥
    exercises/             # 服务端动作库查询服务
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

scripts/                   # 动作数据清洗、翻译和修正脚本
tests/                     # 当前项目内的逻辑测试脚本
docs/                      # 架构、数据库设计与其他说明文档
example/                   # 设计参考 HTML
```

分层约定：

- `app/api/*` 不直接堆业务逻辑，复杂流程下沉到 `lib/server/*`。
- `features/*` 是前端功能模块，可以引用 `lib/client/*` 和 `lib/shared/*`，不应引用 `lib/server/*`。
- `lib/server/*` 是服务端专用代码，可以引用 `lib/shared/*`，不应引用 `lib/client/*`。
- `lib/shared/*` 只放前后端都可安全使用的类型、Schema 和纯函数，不放数据库、环境变量、外部 API 密钥或浏览器状态。
- `components/app/*` 只放跨功能复用的应用级 UI，页面级组件优先放在对应 `features/*/components` 中。


### 其他
- [x] 语音播报增加配置功能，从配置文件读取播报规则，并可以配置播报文字，间隙等
- [ ] 语音播报发音不准，后续加入大模型增加是几声
- [x] 训练完成之后加欢呼动画
- [ ] 加载loading效果
- [ ] 排查动作时间预估是否正确
- [ ] 推荐出来的动作，一键添加到输入框
- [ ] 优化链路，降低token消耗
- [ ] 补齐服务端未支持的功能门控
- [ ] 用户画像完善
- [ ] 编排页面在刷新页面的时候进行拦截提示，避免丢失编排
- [ ] 推荐动作应改有限推荐适合主训练的
- [ ] 字段强校验，模型输出不稳定，怎么解决
- [ ] 超过一定时间的上下文就不用传了
- [ ] 如果消息过多。在聊天页中间加一个开启新对话的功能。

### 待完善场景
- 热身激活经常只推送调整这一个动作
- 目前指定换动作功能异常
- 卡片也添加建议提示
