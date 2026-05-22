# FitMate AI

FitMate AI 是一个 AI 健身聊天助手原型。项目目标是通过自然语言交互理解用户的健身目标、身体状态、训练限制、训练偏好和可用时间，并据此生成、调整和执行个性化训练计划。

当前项目采用 Next.js App Router 构建，前端体验、API Route、服务端 AI 编排、领域规则和共享类型已经按目录做了初步分层。现阶段仍以本地原型和静态动作数据为主，后续会逐步接入数据库、鉴权、用户画像、计划持久化和完整的 AI Tool Calling 闭环。

更完整的架构说明见 [docs/architecture.md](./docs/architecture.md)。

## 当前状态

当前项目主要完成了以下原型能力：

- 首页 AI 聊天界面，支持 DeepSeek 流式响应。
- 聊天页可识别训练计划生成意图，并在服务端生成经过候选动作与规则校验的训练计划草稿。
- 动作库页面，基于 `data/exercises.zh.json` 展示、搜索、筛选动作。
- 动作编排页面，支持从动作库添加动作、调整组数/次数/休息、保存到本地。
- 训练日历页面，支持本地安排训练、设置休息日、标记完成/未完成。
- 训练执行页面，支持倒计时、动作切换、暂停、结束训练。
- 基础响应式 UI、Tailwind CSS 主题和侧边栏导航。
- 前端页面与服务端业务代码已分离：`features/` 承载前端功能模块，`lib/server/` 承载服务端服务，`lib/shared/` 承载共享类型和 Schema。

注意：当前仍是前端原型 + 静态动作数据 + 服务端 AI 编排的阶段，尚未接入数据库、鉴权、服务端训练计划持久化或 AI 工具调用闭环。

## 当前代码对话流程

下面描述的是当前程序真实执行的流程，不是未来规划。

### 1. 前端发送聊天请求

- 做了什么：用户在首页聊天框发送消息后，`useChatController` 会把当前消息和历史消息整理成 `role/content` 数组，请求 `/api/chat`。如果是新会话，会生成 `conversationId` 并写入页面 hash。
- 为什么这么做：前端只负责维护聊天状态和发起请求，把模型调用、动作筛选和训练计划生成都放到服务端，避免浏览器直接接触模型密钥和服务端规则。

### 2. `/api/chat` 校验请求并创建 AI Trace

- 做了什么：`/api/chat` 检查 `DEEPSEEK_API_KEY`，校验请求里是否有 `messages` 数组，只保留合法的 `user/assistant` 消息并截取最近 20 条，同时创建一条 AI 调试 trace。
- 为什么这么做：限制输入格式和上下文长度，保证后续模型请求可控；trace 用于在开发页查看一次对话里每个模型调用、候选筛选和最终输出。

### 3. 第一次调用 DeepSeek：解析聊天意图

- 做了什么：服务端先调用一次 `deepseek-v4-flash`，使用 `chatIntentResolution` 提示词，让模型只返回 JSON。返回结果会用 Zod 校验成 `type`、`needsExerciseContext`、`workoutIntent`、`requestedExerciseName`。
- 为什么这么做：当前代码需要先知道这条消息属于普通健身问答、动作推荐、单次动作编排、长期训练计划、动作替换、动作讲解还是非健身问题，后面才知道是否需要查动作库，以及是否要在回复末尾输出 trigger。

### 4. 意图解析失败时使用兜底规则

- 做了什么：如果第一次模型请求失败、返回非法 JSON 或 Zod 校验失败，代码会调用 `createFallbackChatIntent`。兜底逻辑用关键词粗略判断“推荐/有哪些/动作”为动作推荐，“今天/这次/现在/来一套/分钟/练”为单次编排，默认经验为 `beginner`，单次时长为 30 分钟。
- 为什么这么做：意图解析失败时，聊天功能仍能继续工作，不会因为第一步 JSON 解析失败直接中断整次对话。

### 5. 需要动作上下文时查询动作库

- 做了什么：如果意图结果里的 `needsExerciseContext` 为 `true`，`/api/chat` 会读取 `data/exercises.zh.json`，调用 `selectExerciseCandidates` 筛选动作候选，并把最多 12 个核心候选、8 个补充候选和最多 5 个名称匹配动作整理成 `providedExercises`。
- 为什么这么做：聊天回复里如果要出现具体动作名，模型只能基于服务端提供的动作库候选回答，减少编造动作、推荐不存在动作或推荐不符合条件动作的问题。

### 6. 候选动作筛选规则

- 做了什么：`selectExerciseCandidates` 会先排除不合格动作，再给剩余动作打分。排除条件包括：新手排除 `expert` 动作、疼痛或伤病命中风险标签、器械不匹配、命中用户避开项。打分会考虑目标肌群、动作难度、`beginner_friendly`、目标标签、器械匹配、用户偏好和风险标签。
- 为什么这么做：当前系统用确定性代码先缩小模型可用动作范围，把“动作是否适合用户”的一部分判断放在后端，而不是完全交给模型自由发挥。

### 7. 第二次调用 DeepSeek：生成流式聊天回复

- 做了什么：`/api/chat` 把基础聊天提示词、服务端解析出的意图、候选动作列表和候选状态拼成 system prompt，再第二次请求 `deepseek-v4-flash`。这次请求开启 `stream: true`，前端会持续收到 `reasoning` 和 `content` 事件。
- 为什么这么做：用户先看到流式自然语言回复；如果需要后续生成卡片，模型会在回复末尾输出一个 JSON trigger，前端再根据 trigger 自动调用对应接口。

### 8. 前端解析模型回复里的 trigger

- 做了什么：流式回复结束后，前端用正则从完整回复中解析四类 JSON 代码块：`workout_plan_trigger`、`workout_routine_trigger`、`exercise_recommendation_trigger`、`suggested_question_trigger`。
- 为什么这么做：当前代码没有使用正式 Tool Calling，而是用“模型回复 + 隐藏 trigger”的方式连接聊天回复和后续卡片生成。自然语言给用户看，trigger 给前端决定下一步调用哪个接口。

### 9. 动作推荐分支

- 做了什么：如果解析到 `exercise_recommendation_trigger`，前端调用 `/api/ai/exercise-recommendations`。该接口再次读取动作库并调用 `selectExerciseCandidates`，取最多 8 个候选动作，组装成动作推荐卡片，卡片只包含动作信息、推荐理由和安全提示，不包含组数、次数、休息或训练日安排。
- 为什么这么做：用户只是要“推荐一些动作”时，不生成完整训练计划，避免把动作浏览需求误做成训练编排。

### 10. 单次编排和长期计划分支

- 做了什么：如果解析到 `workout_routine_trigger` 或 `workout_plan_trigger`，前端都会调用 `/api/ai/workout-plan`。区别在于 trigger 里的 `intent.intentType`：`routine` 要求只生成 1 个训练日，`plan` 要求按 `weeklyFrequency` 生成多个训练日。
- 为什么这么做：当前代码复用同一个训练草稿生成接口，用 `intentType` 区分“本次动作编排”和“长期训练计划”，减少重复接口和重复校验逻辑。

### 11. `/api/ai/workout-plan` 生成训练草稿

- 做了什么：接口先用 `aiWorkoutPlanRequestSchema` 校验请求。如果前端传了 trigger intent，就直接使用该 intent；如果没传，就再调用一次 DeepSeek 从聊天记录中抽取 `WorkoutPlanIntent`。随后读取动作库、筛选候选动作，候选不足时直接返回失败。
- 为什么这么做：训练草稿生成必须有结构化意图和足够候选动作。候选不足时不让模型硬编，避免生成无法落地的训练内容。

### 12. 第三次调用 DeepSeek：生成结构化训练草稿

- 做了什么：`generateWorkoutPlanDraft` 会把 `intent`、核心候选动作、补充候选动作和最近聊天记录传给 `deepseek-v4-flash`，要求模型只返回符合 `WorkoutPlanDraft` 结构的 JSON。模型可用动作只包含候选动作里的 `exerciseId`。
- 为什么这么做：训练卡片需要可渲染、可保存、可校验的数据结构，所以这里不接受普通自然语言计划，而是要求模型返回结构化草稿。

### 13. 服务端校验训练草稿

- 做了什么：模型返回后，服务端先用 `workoutPlanDraftSchema` 做结构校验，再用 `validateWorkoutPlanDraft` 校验动作 ID 是否存在、是否来自候选集、训练日时长是否明显超过用户单次时长、周频率是否一致、新手训练量是否偏高、休息时间是否过短、伤病用户是否缺少安全提示等。
- 为什么这么做：当前代码不会把 AI 输出直接交给前端展示。只有结构合法且没有硬错误的草稿才会返回给前端；有问题则返回失败信息。

### 14. 前端展示卡片并保存

- 做了什么：通过校验的 `WorkoutPlanDraft` 会挂到对应聊天气泡下，由 `WorkoutPlanDraftCard` 展示。用户点击保存后，代码会把每个训练日转换成训练编排模块使用的保存结构，写入 `localStorage` 的 `fitmate.workoutHistory`。如果是多天长期计划，还会按每周频率生成 7 天或 28 天日程，写入 `fitmate.trainingSchedule`，然后跳转到 `/plans`；如果是单次编排，则跳转到 `/composer`。
- 为什么这么做：当前项目还没有接入数据库和用户系统，所以先用本地存储把聊天生成结果接到训练编排、训练计划日历和训练执行页面，形成原型闭环。

### 15. 聊天历史保存

- 做了什么：只要当前会话有 `conversationId`，前端会把消息、训练计划卡片和动作推荐卡片保存到 `localStorage` 的 `fitmate.chatHistory`，并触发 `fitmate:chat-history-updated` 事件。
- 为什么这么做：当前阶段没有服务端聊天持久化，本地保存可以让用户在原型里切换和恢复历史会话。

## 技术栈

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- DeepSeek Chat Completions API
- Zod
- 静态 JSON 动作数据

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
```

启动开发服务：

```bash
npm run dev
```

常用检查命令：

```bash
npm run typecheck
npm run lint
npm run build
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
    http/server-request.ts # 服务端外部 HTTP 请求函数
    exercises/             # 服务端动作库查询服务
    workout-plans/         # AI 计划生成、候选动作、计划校验服务
  shared/                  # 前后端共享类型、Schema 和纯数据结构
    exercises/
    workout-plans/

data/
  exercises.zh.json        # 当前使用的中文动作静态数据

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

- [ ] 用户登录、会话管理和用户数据隔离。
- [ ] 用户健身画像管理，包括目标、经验、伤病、器械、可用时间、训练偏好。
- [ ] 聊天历史服务端持久化，替代 `localStorage`。
- [ ] 训练计划服务端保存、编辑、版本管理和删除。
- [ ] 训练日历服务端持久化，支持跨设备同步。
- [ ] 训练执行记录落库，包括动作、组数、完成情况、训练反馈。
- [ ] 训练结束后的主观反馈收集，例如难度、疼痛、疲劳、喜欢/不喜欢的动作。
- [ ] 基于反馈自动调整后续计划。
- [ ] 收藏动作、批量收藏、从动作库直接开始训练。
- [ ] 真实可用的附件、语音、通知、帮助、设置等入口。

### AI 能力

- [x] 使用 Structured Outputs、Zod Schema 或 JSON Schema 约束 AI 输出。
- [x] 服务端校验所有 AI 生成的训练计划。
- [ ] 接入工具调用，让 AI 只能通过受控服务查询动作、读取画像、创建计划。
- [ ] AI 生成计划时只允许选择数据库中存在且通过审核的 `exerciseId`。
- [x] 增加训练计划生成服务：画像 + 候选动作 + 规则约束 + LLM 生成 + 后端校验。
- [ ] 增加计划修改能力，例如替换动作、调整强度、缩短训练时间。
- [ ] 增加缺失信息追问流程，避免用户信息不足时直接生成计划。
- [ ] 增加 AI 请求限流、成本控制和失败日志。
- [ ] 避免 AI 给出医疗诊断或高风险健康建议。

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
- [x] 第一阶段先保存到 `fitmate.workoutHistory`，后续迁移到服务端数据库。
- [x] 增加失败处理：非法 JSON、非法 `exerciseId`、候选动作不足、高风险健康情况、AI 请求失败。
- [x] 增加最小测试：schema 校验、非法 `exerciseId` 拒绝、新手过滤高风险动作、计划保存结构转换。

### 数据与后端

- [ ] 引入 PostgreSQL 作为事实数据来源。
- [ ] 引入 Prisma，建立 `User`、`Exercise`、`WorkoutPlan`、`WorkoutSession`、`ChatSession` 等模型。
- [ ] 将 `data/exercises.zh.json` 迁移为数据库 seed 数据。
- [ ] 为动作库建立审核状态、发布状态、风险标签、目标标签和来源版权字段。
- [ ] 修复动作数据质量问题：当前动作 `published` 为 0，`reviewStatus` 全部未审核，部分动作缺少中文步骤。
- [ ] 增加动作媒体资源同步策略，避免长期依赖第三方图片链接。
- [ ] 所有用户私有数据查询基于 `userId` 做权限隔离。
- [ ] 增加结构化过滤优先、语义检索辅助的动作检索服务。
- [ ] 后续按需引入 pgvector 做自然语言动作搜索和知识检索。

### API 与校验

- [ ] 给 `/api/chat` 增加请求体 Zod 校验。
- [ ] 给 `/api/exercises` 增加 query 参数 Zod 校验。
- [ ] 增加训练计划、训练日历、训练执行、用户画像等 API。
- [x] 避免业务逻辑堆在 API Route 中，沉淀到 service 层。
- [x] 拆分前端请求函数和服务端请求函数，避免浏览器请求与服务器外部请求混用。
- [ ] 统一 API 错误结构和前端错误展示。
- [ ] 增加服务端日志，记录 AI 输出校验失败和工具调用失败。

### 前端体验

- [ ] 移除或禁用尚未实现的按钮，避免用户误以为功能可用。
- [x] 将首页大 Client Component 拆为 `features/chat/components`、`features/chat/hooks`、`features/chat/api` 和 `features/chat/lib`。
- [ ] 将训练编排、训练日历、训练执行从 `localStorage` 迁移到服务端数据。
- [ ] 训练执行页增加休息步骤、每组完成确认、跳过原因、恢复训练能力。
- [ ] 首页右侧训练概览接入真实计划和今日训练进度。
- [ ] 动作库图片改用 `next/image` 或自定义图片加载策略。
- [ ] 优化移动端侧边栏和训练执行页布局。
- [ ] 增加加载、空状态、错误重试和离线状态处理。

### 安全与合规

- [ ] 不信任客户端输入，所有写操作都做服务端校验。
- [ ] 不持久化未经校验的原始 AI 输出。
- [ ] 不向 AI 工具暴露任意 SQL 查询能力。
- [ ] 对疼痛、伤病、疾病、孕期等高风险情况增加明确安全边界。
- [ ] 增加用户隐私数据保护策略。
- [ ] 明确开源动作数据来源、许可证和媒体资源使用边界。

### 工程质量

- [ ] 增加测试目录和测试框架。
- [ ] 为动作过滤、计划估算、风险过滤、AI 输出校验增加单元测试。
- [ ] 为关键页面增加基础集成测试或端到端测试。
- [ ] 增加 CI，至少运行 `npm run typecheck`、`npm run lint`、`npm run build`。
- [ ] 处理当前 lint 中的 `<img>` 优化警告。
- [ ] 评估是否需要锁定 Next.js/React 版本，降低升级风险。
