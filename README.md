# FitMate AI

FitMate AI 是一个 AI 健身聊天助手原型。项目目标是通过自然语言交互理解用户的健身目标、身体状态、训练限制、训练偏好和可用时间，并据此生成、调整和执行个性化训练计划。

当前项目采用 Next.js App Router 构建，前端体验、API Route、服务端 AI 编排、领域规则、共享类型和 Prisma 数据模型已经按目录做了初步分层。动作库、聊天历史、训练编排、训练日历和训练执行状态已接入 PostgreSQL/Prisma；当前仍缺少正式鉴权、用户画像管理和完整的 AI Tool Calling 闭环。

更完整的架构说明见 [docs/architecture.md](./docs/architecture.md)。当前数据库表结构、字段含义和关系说明见 [docs/database-design.md](./docs/database-design.md)，该文档根据已有数据库整理，仅用于帮助开发者理解当前设计，不作为数据库设计规范。

## 当前状态

当前项目主要完成了以下原型能力：

- 首页 AI 聊天界面，支持 DeepSeek 流式响应。
- 聊天页可识别训练计划和单次训练编排意图，并在服务端生成经过分池候选动作与规则校验的结构化草稿。
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
npm run db:refresh-embeddings
```

启动开发服务：

```bash
npm run dev
```

常用命令：

```bash
npm test
npm run typecheck
npm run lint
npm run build
docker compose ps
docker compose stop postgres
docker compose down
```

测试与验证命令：

- `npm test`：运行 Vitest 自动化测试，覆盖共享领域逻辑、服务边界、API Route 边界和前端请求转换。
- `npm run typecheck`：运行 TypeScript 静态类型检查。
- `npm run lint`：运行 ESLint 源码质量检查。
- `npm run build`：验证 Next.js 构建、路由和服务端/客户端模块边界。
- UI/交互或浏览器能力变更仍需使用 Chrome DevTools MCP 做真实 Chrome 验证，并检查页面渲染、Console、Network 和关键交互结果。

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
  workouts/                # 前端训练编排、日历、执行相关页面组件
  workout-plans/           # 前端训练计划草稿转换为 routine 的工具

lib/
  client/                  # 浏览器专用基础设施
    http/client-request.ts # 前端统一请求函数
  server/                  # 服务端专用基础设施和业务服务
    ai/                    # 服务端 AI prompt 配置和模型调用配置
    chat/                  # 服务端聊天意图解析、候选动作注入和流式回复编排
    db/                    # Prisma Client 单例和数据库配置入口
    http/server-request.ts # 服务端外部 HTTP 请求函数
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
  schema.prisma            # PostgreSQL/Prisma 数据模型

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

## TODO

### 产品功能

- [ ] 后续处理：用户登录、会话管理和正式用户数据隔离。
- [ ] 后续处理：用户健身画像管理，包括目标、经验、伤病、器械、可用时间、训练偏好。
- [x] 聊天历史服务端持久化，替代 `localStorage`。
- [x] 训练编排服务端保存、编辑和删除。
- [x] 训练日历服务端持久化，支持跨设备同步的基础数据结构。
- [x] 训练执行结果落库，结束训练后写入 `WorkoutSessionResult` 并同步日历完成状态。
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
- [ ] 后续处理：生成用户画像后，用用户常练时长、经验水平、近期训练负荷和偏好推测默认训练时长。
- [ ] 后续处理：增加 AI 请求限流、成本控制和生产级失败日志。
- [ ] 后续处理：将高风险健康情况从提示词约束升级为服务端硬拦截。

### AI 架构实施 TODO

以下 TODO 只记录待解决的问题，不指定具体实现方案。详细背景见 [docs/AI上下文与训练计划架构改进方案.md](./docs/AI上下文与训练计划架构改进方案.md)。

- [ ] 用户说“我想练胸”时，系统能否稳定理解训练目标，并推送合适的动作或训练内容？
- [ ] 用户说“把这个计划中的平板支撑换一个”时，系统能否定位到具体计划和具体动作？
- [ ] 用户持续说“换一批动作”时，系统能否避免重复推荐，并在没有更多动作时给出明确反馈？
- [ ] 用户说“明天我要休息”时，系统能否理解并调整相关训练安排？
- [ ] 系统是否具备可长期复用的用户画像、偏好和动作反馈记录能力？
- [ ] 用户说“俯卧撑不喜欢，换一个”时，系统能否只替换该动作，并保持其他计划内容不变？
- [ ] 用户在一周计划执行到第三天时反馈“俯卧撑太难”，系统能否自动处理后续训练安排中的同类动作？

### 架构升级

以下 TODO 记录从当前 AI 训练计划生成原型迁移到可引用、可修订、可验证、可追踪编排系统的大体方向。详细迁移方案见 [docs/AI上下文与训练计划架构改进方案.md](./docs/AI上下文与训练计划架构改进方案.md)。

- [ ] 第一阶段：将聊天推送的动作推荐、routine 和 plan 卡片沉淀为 `ConversationArtifact` 与 `ArtifactIndex`，让 UI 卡片成为后续 AI 可引用的结构化事实源。
- [ ] 第一阶段：增加 `ReferenceResolver`，支持“这个”“上一个”“刚才那套”“之前练胸的”这类引用定位，并在歧义时让用户确认。
- [ ] 第一阶段：增加基础 `WorkoutPatch` / `PlanPatch` 流程，让“替换一个动作”“降低这个动作难度”等修改先走局部 Patch，而不是重生成整份计划。
- [x] 第一阶段：补齐基础 AI Trace，记录 artifact、引用解析、工具调用、Patch、校验和保存结果，方便复盘错误来源。
- [ ] 第二阶段：完善动作元数据、分池检索和推荐去重，减少重复推荐，并在候选不足时给出明确反馈。
- [ ] 第二阶段：建设服务端领域计划引擎，将长期计划展开、周期安排、训练日调整和未来 schedule 修改从 LLM 自由生成迁移到确定性服务。
- [ ] 第二阶段：引入用户反馈与长期偏好记忆，区分临时偏好、明确 dislike、长期限制和训练历史。
- [ ] 第三阶段：补充 Policy Engine 与 Confirmation Gate，对批量修改、覆盖已保存 routine、写入长期记忆和高风险调整做显式确认。
- [ ] 第三阶段：按需增强 RAG / Hybrid Search、Replay 和 Eval Suite，让复杂引用、动作检索和 AI 编排回归具备持续验证能力。

### 最小可用 AI 闭环

- [x] 新增训练计划和单次编排草稿类型与 Zod Schema，包括周期化三段式 `WorkoutPlanDraft`、`WorkoutDayDraft`、`WorkoutPlanItemDraft`、`WorkoutRoutineDraft`。
- [x] 新增用户计划意图结构，包括目标、经验、每次可用时间、每周频率、器械、伤病限制、偏好和避开项。
- [x] 新增动作候选服务，根据用户意图从动作库筛选候选动作，并按热身、主训练、拉伸和替代用途分池。
- [x] 新增动作安全过滤逻辑，例如新手优先 beginner、疼痛或伤病用户排除高风险动作。
- [x] 新增 `exerciseId` 和 section 校验逻辑，确保 AI 生成的动作都存在于动作库、来自候选集且允许进入对应训练阶段。
- [x] 新增 AI 训练计划生成服务，要求模型只基于候选动作返回结构化 JSON；长期计划返回 `kind = "plan"`，单次编排返回 `kind = "routine"`。
- [x] 新增训练计划和单次编排校验服务，校验动作 ID、训练时长、训练强度、组数、次数/时长、休息时间、三段式 section 和主训练循环配置。
- [x] 新增 `POST /api/ai/workout-plan`，用于根据聊天上下文生成可保存的训练计划草稿或单次训练编排草稿。
- [x] 聊天页支持展示 AI 生成的计划草稿，包括标题、目标、周期天数、训练日/休息日数量、训练日角色、三段式动作、恢复策略和安全提示。
- [x] 聊天页支持展示 AI 生成的单次训练编排草稿，包括热身、训练、拉伸三段式动作、主训练循环轮数、循环间休息和动作执行参数。
- [x] 聊天页增加保存入口：长期计划草稿会按周期日把非休息日转换为多套 `WorkoutRoutine`，并按本周期、重复 2 个周期或重复 4 个周期写入训练日历；单次训练编排草稿会直接转换并保存为一套 `WorkoutRoutine`。
- [x] 计划草稿保存到服务端数据库，并可自动写入训练日历。
- [x] 增加失败处理：非法 JSON、非法 `exerciseId`、候选动作不足、高风险健康情况、AI 请求失败。
- [x] 增加最小测试：schema 校验、非法 `exerciseId` 拒绝、新手过滤高风险动作、计划保存结构转换。

### 数据与后端

- [x] 静态动作数据已包含发布状态、审核状态、风险标签、目标标签和来源许可证字段，seed 时会归一化训练阶段、角色、运动模式、难度、替代关系元数据和 hybrid search embedding。
- [x] 建立 PostgreSQL / Prisma 数据层骨架。
- [x] 引入 Prisma，建立 `User`、`Exercise`、`WorkoutRoutine`、`WorkoutSchedule`、`WorkoutSessionResult`、`ChatSession` 等核心模型。
- [x] 将 `data/exercises.zh.json` 迁移为数据库 seed 数据。
- [x] 运行时动作库、聊天、训练编排、训练日历和训练状态读写已统一走 PostgreSQL/Prisma。
- [x] Artifact 与 Exercise 支持结构化硬过滤约束下的本地 hybrid search；迁移或历史数据导入后可运行 `npm run db:refresh-embeddings` 刷新 `embeddingText` 与 `embedding`。
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
- [ ] 后续处理：排查训练执行页动作开始后不自动计时的问题；已知现象是语音能播报到“开始”，但页面仍卡在动作开始状态。
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

- [x] 已接入 Vitest 和 `npm test`，测试失败会返回非零退出码。
- [x] 已将既有手写 `console.assert` 测试迁移为正式测试框架用例。
- [x] 已覆盖动作过滤、风险过滤、AI 输出 Schema 校验、计划保存结构转换、训练 timeline、聊天上下文、trigger 解析、API 边界和请求封装。
- [x] 已提供 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build` 检查脚本。
- [ ] 后续处理：为关键页面增加基础集成测试或端到端测试。
- [ ] 后续处理：增加 CI，至少运行 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。
- [ ] 可选处理：评估是否需要锁定 Next.js/React 版本，降低升级风险。

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


### 待完善场景
- 热身激活经常只推送调整这一个动作
- 目前指定换动作功能异常
- 卡片也添加建议提示
