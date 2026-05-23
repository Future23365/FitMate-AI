# FitMate AI

FitMate AI 是一个 AI 健身聊天助手原型。项目目标是通过自然语言交互理解用户的健身目标、身体状态、训练限制、训练偏好和可用时间，并据此生成、调整和执行个性化训练计划。

当前项目采用 Next.js App Router 构建，前端体验、API Route、服务端 AI 编排、领域规则、共享类型和 Prisma 数据模型已经按目录做了初步分层。动作库、聊天历史、训练编排、训练日历和训练执行状态已接入 PostgreSQL/Prisma；当前仍缺少正式鉴权、用户画像管理和完整的 AI Tool Calling 闭环。

更完整的架构说明见 [docs/architecture.md](./docs/architecture.md)。

## 当前状态

当前项目主要完成了以下原型能力：

- 首页 AI 聊天界面，支持 DeepSeek 流式响应。
- 聊天页可识别训练计划生成意图，并在服务端生成经过候选动作与规则校验的训练计划草稿。
- 动作库页面，基于 PostgreSQL/Prisma 动作 repository 展示、搜索、筛选动作。
- 动作编排页面，支持从动作库添加动作、调整组数/次数/休息，并保存到数据库。
- 训练日历页面，支持数据库持久化安排训练、设置休息日、标记完成/未完成。
- 训练执行页面，支持倒计时、动作切换、暂停、结束训练，并同步训练完成状态。
- 基础响应式 UI、Tailwind CSS 主题和侧边栏导航。
- 前端页面与服务端业务代码已分离：`features/` 承载前端功能模块，`lib/server/` 承载服务端服务，`lib/shared/` 承载共享类型和 Schema。

注意：当前仍是前端原型 + 动作 seed 数据 + 服务端 AI 编排的阶段，尚未接入正式鉴权或 AI 工具调用闭环。运行时数据以 PostgreSQL 为事实来源，本地运行需要配置 `DATABASE_URL` 后执行迁移与 seed；`data/exercises.zh.json` 只作为动作 seed 来源，不再作为运行时数据回退。

## 技术栈

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL
- DeepSeek Chat Completions API
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
DEEPSEEK_API_KEY=
DATABASE_URL="postgresql://fitmate:fitmate@localhost:5432/fitmate?schema=public"
```

启动本地 PostgreSQL：

```bash
docker compose up -d postgres
```

初始化 Prisma Client、数据库表和动作 seed 数据：

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

启动开发服务：

```bash
npm run dev
```

常用命令：

```bash
npm run typecheck
npm run lint
npm run build
docker compose ps
docker compose stop postgres
docker compose down
```

## 目录说明

项目按 Next.js App Router 和前后端边界进行组织：

```txt
app/
  api/                     # Route Handlers，仅做 HTTP 入参/出参和服务层调用
    ai/workout-plan/       # AI 训练计划草稿生成接口
    chat/                  # 聊天流式响应接口
    exercises/             # 动作库查询接口
  page.tsx                 # 首页路由入口，渲染聊天功能模块
  composer/page.tsx        # 动作编排页路由入口
  exercises/page.tsx       # 动作库页路由入口
  plans/page.tsx           # 训练计划页路由入口
  training/page.tsx        # 训练执行页路由入口

components/
  app/                     # 跨功能复用的应用级 UI，如侧边栏、Logo、图标

features/
  chat/                    # 前端聊天功能模块
    api/                   # 浏览器侧 API client
    components/            # 聊天页面 UI
    hooks/                 # 聊天状态机和流式读取逻辑
    lib/                   # 聊天历史、计划触发解析等前端工具
    types.ts               # 聊天相关类型
  exercises/               # 前端动作库功能模块
  workouts/                # 前端训练编排、计划、执行相关页面组件
  workout-plans/           # 前端训练计划转换与保存相关工具

lib/
  client/                  # 浏览器专用基础设施
    http/client-request.ts # 前端统一请求函数
  server/                  # 服务端专用基础设施和业务服务
    db/                    # Prisma Client 单例和数据库配置入口
    http/server-request.ts # 服务端外部 HTTP 请求函数
    exercises/             # 服务端动作库查询服务
    workout-plans/         # AI 计划生成、候选动作、计划校验服务
  shared/                  # 前后端共享类型、Schema 和纯数据结构
    exercises/
    workout-plans/

data/
  exercises.zh.json        # 中文动作 seed 数据，开发期无数据库时作为回退数据源

prisma/
  schema.prisma            # PostgreSQL/Prisma 数据模型

scripts/                   # 动作数据清洗、翻译和修正脚本
tests/                     # 当前项目内的逻辑测试脚本
docs/                      # 架构与设计文档
example/                   # 设计参考 HTML
```

分层约定：

- `app/api/*` 不直接堆业务逻辑，复杂流程下沉到 `lib/server/*`。
- `features/*` 是前端功能模块，可以引用 `lib/client/*` 和 `lib/shared/*`，不应引用 `lib/server/*`。
- `lib/server/*` 是服务端专用代码，可以引用 `lib/shared/*`，不应引用 `lib/client/*`。
- `lib/shared/*` 只放前后端都可安全使用的类型、Schema 和纯函数，不放数据库、环境变量、外部 API 密钥或浏览器状态。
- `components/app/*` 只放跨功能复用的应用级 UI，页面级组件优先放在对应 `features/*/components` 中。

## TODO

### 产品功能

- [ ] 后续处理：用户登录、会话管理和正式用户数据隔离。
- [ ] 后续处理：用户健身画像管理，包括目标、经验、伤病、器械、可用时间、训练偏好。
- [x] 聊天历史服务端持久化，替代 `localStorage`。
- [x] 训练编排服务端保存、编辑和删除。
- [x] 训练日历服务端持久化，支持跨设备同步的基础数据结构。
- [x] 训练执行状态落库，结束训练后同步完成状态。
- [ ] 后续处理：训练计划版本管理、完整训练执行明细、动作组完成情况和训练反馈。
- [ ] 后续处理：训练结束后的主观反馈收集，例如难度、疼痛、疲劳、喜欢/不喜欢的动作。
- [ ] 后续处理：基于反馈自动调整后续计划。
- [ ] 后续处理：收藏动作、批量收藏、从动作库直接开始训练。
- [ ] 暂缓处理：真实可用的附件、语音、通知、帮助、设置等入口。

### AI 能力

- [x] 使用 Structured Outputs、Zod Schema 或 JSON Schema 约束 AI 输出。
- [x] 服务端校验所有 AI 生成的训练计划。
- [x] 增加训练计划生成服务：意图解析 + 候选动作 + 规则约束 + LLM 生成 + 后端校验。
- [x] 增加 AI Trace 调试台和 AI 输出校验失败日志。
- [x] 在提示词层面约束 AI 避免医疗诊断或高风险健康建议。
- [ ] 后续处理：接入 Tool Calling，让 AI 只能通过受控服务查询动作、读取画像、创建计划。
- [ ] 后续处理：AI 生成计划时只允许选择数据库中存在且通过审核的 `exerciseId`。
- [ ] 后续处理：增加计划修改能力，例如替换动作、调整强度、缩短训练时间。
- [ ] 后续处理：增加确定性的缺失信息追问流程，避免用户信息不足时直接生成计划或动作候选。
- [ ] 后续处理：优化“今天练什么”等宽泛请求：优先结合用户画像、训练历史、器械偏好和近期训练记录生成个性化候选；缺少上下文时先追问，避免所有用户得到相同推荐。
- [ ] 后续处理：增加 AI 请求限流、成本控制和生产级失败日志。
- [ ] 后续处理：将高风险健康情况从提示词约束升级为服务端硬拦截。

### 最小可用 AI 闭环

- [x] 新增训练计划草稿类型和 Zod Schema，包括 `WorkoutPlanDraft`、`WorkoutDayDraft`、`WorkoutPlanItemDraft`。
- [x] 新增用户计划意图结构，包括目标、经验、每次可用时间、每周频率、器械、伤病限制、偏好和避开项。
- [x] 新增动作候选服务，根据用户意图从动作库筛选候选动作。
- [x] 新增动作安全过滤逻辑，例如新手优先 beginner、疼痛或伤病用户排除高风险动作。
- [x] 新增 `exerciseId` 校验逻辑，确保 AI 生成的动作都存在于动作库且来自候选集。
- [x] 新增 AI 训练计划生成服务，要求模型只基于候选动作返回结构化 JSON。
- [x] 新增训练计划校验服务，校验动作 ID、训练时长、训练强度、组数、次数/时长和休息时间。
- [x] 新增 `POST /api/ai/workout-plan`，用于根据聊天上下文生成可保存的训练计划草稿。
- [x] 聊天页支持展示 AI 生成的计划草稿，包括标题、目标、周频率、训练日、动作、组数、次数/时长、休息和安全提示。
- [x] 聊天页增加“保存计划”入口，将计划草稿转换为当前动作编排使用的保存结构。
- [x] 计划草稿保存到服务端数据库，并可自动写入训练日历。
- [x] 增加失败处理：非法 JSON、非法 `exerciseId`、候选动作不足、高风险健康情况、AI 请求失败。
- [x] 增加最小测试：schema 校验、非法 `exerciseId` 拒绝、新手过滤高风险动作、计划保存结构转换。

### 数据与后端

- [x] 静态动作数据已包含发布状态、审核状态、风险标签、目标标签和来源许可证字段。
- [x] 建立 PostgreSQL / Prisma 数据层骨架。
- [x] 引入 Prisma，建立 `User`、`Exercise`、`WorkoutPlan`、`WorkoutSession`、`ChatSession` 等核心模型。
- [x] 将 `data/exercises.zh.json` 迁移为数据库 seed 数据。
- [x] 运行时动作库、聊天、训练编排、训练日历和训练状态读写已统一走 PostgreSQL/Prisma。
- [ ] 后续处理：配置真实托管 PostgreSQL 实例并执行迁移，让数据库成为线上事实数据来源。
- [ ] 后续处理：建立动作审核流程，将 `reviewStatus=machine_translated` 的动作转为人工审核状态。
- [ ] 后续处理：修复动作数据质量问题：当前动作 `published=false`，少量中文步骤仍含英文长句。
- [ ] 后续处理：增加动作媒体资源同步策略，避免长期依赖第三方图片链接。
- [x] 当前开发期匿名用户的数据查询已基于 `userId` 做隔离。
- [ ] 后续处理：正式鉴权接入后，用真实登录用户替换开发期匿名用户。
- [ ] 后续处理：增加结构化过滤优先、语义检索辅助的动作检索服务。
- [ ] 可选处理：后续按需引入 pgvector 做自然语言动作搜索和知识检索。

### API 与校验

- [x] 避免业务逻辑堆在 API Route 中，沉淀到 service 层。
- [x] 拆分前端请求函数和服务端请求函数，避免浏览器请求与服务器外部请求混用。
- [x] `POST /api/ai/workout-plan` 和 `POST /api/ai/exercise-recommendations` 已使用 Zod 校验请求体。
- [x] 给 `/api/chat` 增加完整请求体 Zod 校验。
- [x] 给 `/api/exercises` 增加 query 参数 Zod 校验，替代手写解析。
- [ ] 后续处理：增加训练计划、训练日历、训练执行、用户画像等服务端 API。
- [ ] 后续处理：统一 API 错误结构和前端错误展示。
- [ ] 后续处理：接入 Tool Calling 后记录工具调用失败日志。

### 前端体验

- [x] 将首页大 Client Component 拆为 `features/chat/components`、`features/chat/hooks`、`features/chat/api` 和 `features/chat/lib`。
- [x] 动作库、推荐卡片、计划草稿、动作编排和训练执行页图片已改用 `next/image`。
- [x] 已处理当前代码中的 `<img>` 使用，避免 Next.js `<img>` 优化警告。
- [x] 动作库、聊天和动作编排已有基础加载、空状态和错误提示。
- [ ] 后续处理：移除、禁用或补全尚未实现的按钮，避免用户误以为功能可用。
- [x] 训练编排、训练日历、训练执行状态已从 `localStorage` 迁移到服务端数据。
- [ ] 后续处理：训练执行页增加休息步骤、每组完成确认、跳过原因、恢复训练能力。
- [ ] 后续处理：首页右侧训练概览接入真实计划和今日训练进度。
- [ ] 后续处理：优化移动端侧边栏和训练执行页布局。
- [ ] 后续处理：补齐全站错误重试、离线状态和表单提交状态处理。

### 安全与合规

- [x] 训练计划草稿保存前会经过 Zod Schema、候选动作和训练规则校验。
- [x] 当前未向 AI 暴露任意 SQL 查询能力。
- [ ] 后续处理：不信任客户端输入，所有服务端写操作都做权限校验和数据校验。
- [ ] 后续处理：不持久化未经校验的原始 AI 输出；聊天历史服务端化时需要区分原始回复和结构化产物。
- [ ] 后续处理：对疼痛、伤病、疾病、孕期等高风险情况增加服务端硬安全边界。
- [ ] 后续处理：增加用户隐私数据保护策略。
- [ ] 后续处理：明确开源动作数据来源、许可证和媒体资源使用边界。

### 工程质量

- [x] 已增加 `tests/` 目录和训练计划核心逻辑测试脚本。
- [x] 已覆盖动作过滤、风险过滤、AI 输出 Schema 校验和计划保存结构转换的基础测试。
- [x] 已提供 `npm run typecheck`、`npm run lint`、`npm run build` 检查脚本。
- [ ] 后续处理：接入正式测试框架和 `npm test` 脚本，替代手写 `console.assert`。
- [ ] 后续处理：为计划估算、动作推荐和聊天触发解析增加更完整的单元测试。
- [ ] 后续处理：为关键页面增加基础集成测试或端到端测试。
- [ ] 后续处理：增加 CI，至少运行 `npm run typecheck`、`npm run lint`、`npm run build`。
- [ ] 可选处理：评估是否需要锁定 Next.js/React 版本，降低升级风险。
