# AGENTS.md

## 语言与回复规则

- 默认所有回复使用简体中文。
- 所有可见回复如计划说明、进度说明、总结也使用简体中文。
- 命令、路径、报错、日志、代码标识必须保持原样，不要翻译或改写；随后再用中文解释。
- 如需引用英文原文，先贴英文原文代码块，再用中文解释。
- git 提交消息使用中文。
- 如果用户的问题是分析、评审、解释或方案讨论，除非用户明确要求修改代码，否则只回答问题并给出可执行建议，不直接改代码。

## 项目概述

本项目是 FitMate AI，一个基于 Next.js App Router 的 AI 健身聊天助手原型。系统通过自然语言交互理解用户的健身目标、身体状态、训练限制、训练偏好和可用时间，并据此生成、调整和执行个性化训练计划。

完整架构说明见 `docs/architecture.md`。当前 README 中的运行状态和本地启动说明见 `README.md`。

## 当前技术栈

- 应用框架：Next.js App Router、React、TypeScript。
- 样式：Tailwind CSS，项目内有 Material Design 3 风格 token。
- 数据层：PostgreSQL、Prisma。
- 校验：Zod。
- AI 调用：DeepSeek Chat Completions API，已有 OpenAI SDK / Vercel AI SDK 方向约束。
- HTTP：Next.js Route Handlers，浏览器侧统一使用 `lib/client/http/client-request.ts`。
- 日志：`scripts/dev-with-error-log.mjs` 会把 dev 错误写入 `codex_logs/error_log.js`，AI Trace 相关内容写入 `codex_logs/ai_trace_log.js`。

`package.json` 中当前脚本：

- `npm run dev`：通过 `scripts/dev-with-error-log.mjs` 启动开发服务。
- `npm run build`：执行 `next build`。
- `npm run start`：执行 `next start`。
- `npm run lint`：执行 `eslint .`。
- `npm run typecheck`：执行 `tsc --noEmit`。
- `npm run db:generate`：执行 `prisma generate`。
- `npm run db:migrate`：执行 `prisma migrate dev`。
- `npm run db:seed`：执行 `node scripts/seed-exercises.mjs`。

当前 `package.json` 没有 `test` 脚本。仓库中存在 `tests/workout-plan.test.ts`，但没有配置 npm 测试命令；不要猜测测试命令。

## 目录结构

```txt
app/
  api/                         # Next.js Route Handlers
  page.tsx                     # 首页聊天入口
  composer/page.tsx            # 动作编排页
  dev/ai-traces/page.tsx       # AI Trace 调试台
  exercises/page.tsx           # 动作库页
  plans/page.tsx               # 训练计划页
  settings/page.tsx            # 设置页
  training/page.tsx            # 训练执行页

components/
  app/                         # 应用级 UI，如侧栏、Logo、图标、路由动效
  dev/                         # 开发调试 UI

features/
  chat/                        # 前端聊天模块、状态 hook、API client、触发解析
  exercises/                   # 前端动作库、动作详情、推荐卡片
  workout-plans/               # 训练计划草稿转换与保存工具
  workouts/                    # 动作编排、训练日历、训练执行页面组件

lib/
  client/                      # 浏览器专用基础设施
  server/                      # 服务端服务、AI 编排、领域服务、数据访问
  shared/                      # 前后端共享类型、Zod Schema、纯函数

prisma/                        # Prisma schema 与迁移
scripts/                       # dev 启动包装与 seed 脚本
tests/                         # 当前未接入 npm script 的逻辑测试文件
docs/                          # 架构文档
openspec/                      # OpenSpec 变更与规格目录
```

分层约定：

- `app/api/*` 只负责 HTTP 入参、出参、错误响应和调用服务层，不堆业务逻辑。
- `features/*` 承载前端功能模块，可以引用 `lib/client/*` 和 `lib/shared/*`，不能引用 `lib/server/*`。
- `lib/server/*` 承载服务端基础设施、AI 编排、领域服务和数据访问，可以引用 `lib/shared/*`，不能引用浏览器专用代码。
- `lib/shared/*` 只放前后端都可安全使用的类型、Schema 和纯函数，不放数据库、环境变量、API 密钥或浏览器状态。
- 跨功能复用的应用级 UI 放在 `components/app/*`，页面级组件优先放在对应 `features/*/components`。

## 路由与 API

页面路由：

- `/`：聊天首页，入口文件 `app/page.tsx`。
- `/composer`：动作编排页，入口文件 `app/composer/page.tsx`。
- `/dev/ai-traces`：AI Trace 调试台，入口文件 `app/dev/ai-traces/page.tsx`。
- `/exercises`：动作库页，入口文件 `app/exercises/page.tsx`。
- `/plans`：训练计划页，入口文件 `app/plans/page.tsx`。
- `/settings`：设置页，入口文件 `app/settings/page.tsx`。
- `/training`：训练执行页，入口文件 `app/training/page.tsx`。

API 路由：

- `POST /api/chat`：聊天流式响应、意图识别、候选动作注入、trigger 输出。
- `GET /api/chat/conversations`、`POST /api/chat/conversations`、`GET|PUT|DELETE /api/chat/conversations/[id]`：聊天会话持久化。
- `POST /api/ai/workout-plan`：AI 训练计划草稿生成。
- `POST /api/ai/exercise-recommendations`：AI 动作推荐卡片生成。
- `GET /api/exercises`、`GET /api/exercises/[id]`：动作库查询与动作详情。
- `GET|POST /api/workouts`、`GET|PUT|DELETE /api/workouts/[id]`：保存的训练编排。
- `GET|POST /api/workout-sessions`、`GET|PATCH|DELETE /api/workout-sessions/[id]`：训练日历与训练执行记录。
- `GET|POST|DELETE /api/dev/ai-traces`：开发期 AI Trace 调试数据。

## 状态管理约定

- 当前项目没有 Redux、Zustand 或 React Query 依赖；不要擅自引入新的全局状态库。
- 前端状态主要使用 React `useState`、`useEffect`、`useMemo` 和自定义 hook。
- 聊天主状态集中在 `features/chat/hooks/use-chat-controller.ts`。
- 浏览器请求统一走 `features/*/api/*` 或 `lib/client/http/client-request.ts`。
- 持久化事实数据优先走服务端 API 和 PostgreSQL/Prisma，不要把关键业务状态只保存在 `localStorage`。
- 若新增跨页面共享状态，先判断是否应该落库或由 URL/API 驱动；确需客户端状态时，再提取清晰边界的 hook 或小型 store。

## OpenSpec 工作流

本项目已接入 OpenSpec，`openspec/changes` 和 `openspec/specs` 是长期规格与变更管理入口。当前 `openspec list --json` 返回 `{"changes":[]}`，表示没有活跃 change。

### 何时必须先走 OpenSpec

以下情况必须先创建或更新 OpenSpec change，再实现代码：

- 新增用户可见功能、业务流程或页面。
- 修改训练计划、动作推荐、聊天意图、AI trigger、AI Trace、数据持久化等核心行为。
- 修改 API 契约、数据模型、Zod Schema、Prisma schema 或权限边界。
- 引入新依赖、新基础设施、新状态管理方案或明显改变架构分层。
- 跨多个模块的 UI/交互改版，尤其会改变用户流程或数据语义时。
- 修复 bug 时发现需要改变领域模型、状态模型、AI 编排流程或长期规则。
- 需求模糊、范围可能扩张，或需要先对齐验收标准时。

以下情况可以不先走 OpenSpec：

- 只回答问题、解释代码、做 code review、定位日志。
- 用户明确要求 hotfix、quick patch、minimal change，并且改动范围很窄。
- 只修改错别字、注释、README 小段说明、AGENTS.md 工作流规则等文档。
- 不改变行为的局部样式修正，且用户明确要求只改样式。

如果不确定是否需要 OpenSpec，先说明判断并优先走 OpenSpec。

### 创建和更新 change

- 新需求优先使用 `/opsx:propose <change-name>` 或等价 OpenSpec 流程创建 change。
- change 名称使用 kebab-case，例如 `add-training-feedback`。
- 创建后读取 `openspec status --change "<name>" --json`，按 CLI 返回的 artifact 依赖顺序生成所需文件。
- 不要凭经验假设 schema 固定为某几个文件；以 `openspec status` 和 `openspec instructions` 返回结果为准。
- 写 artifact 时，只把用户需求、设计决策、规格差异和验收标准写入文件；不要把工具输出中的上下文规则原样复制进去。

### 如何拆 tasks

`tasks.md` 必须拆成可以逐项验证的实现步骤：

- 每个 task 使用复选框，表达一个可完成、可验证的增量。
- 按依赖顺序排列：类型/Schema → 服务层/领域逻辑 → API → 前端状态 → UI → 测试/验证 → 文档。
- 一个 task 不要混合多个无关目标；跨层改动可以作为一个垂直切片，但要写清输入、输出和验证点。
- 行为变化必须包含测试、校验或手动验证任务。
- 涉及 AI 输出时，必须包含结构约束、服务端校验、失败日志或 trace 验证任务。
- 涉及数据库时，必须包含 Prisma schema、迁移、权限隔离和 seed/数据迁移影响检查。
- 不要把“修一下”“优化一下”“处理边界情况”作为不可验证的 task；要写明具体边界和完成条件。

### 如何逐项实现

- 实现前运行或查看 `openspec status --change "<name>" --json` 和 `openspec instructions apply --change "<name>" --json`。
- 先读取 CLI 返回的 `contextFiles`，再读相关代码；不要只凭记忆实现。
- 每次只处理一个 pending task 或一个紧密相关的小组任务。
- 完成一个 task 后立即把 `tasks.md` 中对应项从 `- [ ]` 改为 `- [x]`。
- 如果实现中发现设计不成立，暂停并更新 proposal/design/spec/tasks，不要继续把错误设计硬做完。
- 如果用户中途改变需求，先判断是否需要更新 OpenSpec artifact，再继续实现。
- 所有代码改动仍需遵守本文件的架构、AI、数据、安全和 UI 规则。

### 归档

- change 的 tasks 全部完成并验证后，使用 `/opsx:archive <change-name>` 或等价 OpenSpec 流程归档。
- 归档前检查 artifact 完成状态、tasks 勾选状态，以及 delta spec 是否需要同步到 `openspec/specs`。
- 不要在未确认任务完成和规格同步状态时直接移动 change 目录。

## 开发理念

本项目处于早期阶段，目前没有明显的历史包袱。在修 bug 或改功能时，不要默认以“最小改动”为目标。优先选择当前阶段下最完整、最清晰、最可长期维护的设计方案。

默认优先级：

1. 正确性和长期可维护性优先于最小改动量。
2. 清晰的架构优先于局部 workaround。
3. 统一的代码模式优先于保留偶然形成的旧写法。
4. 强类型、明确的数据流、可预测的状态管理。
5. 当抽象能减少未来重复时，优先提取可复用抽象。
6. 行为变化时，同步更新测试、校验逻辑或相关文档。
7. 替换旧方案时，主动删除过时、误导或无用的代码。

修复 bug 时：

- 找到根因，而不是只修表面现象。
- 判断这个 bug 是否暴露了抽象不合理、状态模型混乱、领域模型不完整等问题。
- 如果更大的重构能让系统更清晰、更安全，优先选择重构方案。
- 除非明确要求，否则不要为了兼容旧写法而增加临时兼容层。

新增或修改功能时：

- 按照当前阶段的理想实现方式来设计。
- 同步更新相关类型、API、状态结构、测试和文档。
- 优先保持模块边界清晰，不要把功能逻辑分散到多个无关位置。
- 除非用户明确要求，否则不要仅仅为了向后兼容而保留旧行为。

开始修改前，先简要说明：

1. 问题根因或产品需求。
2. 准备采用的设计方向。
3. 预计会影响的文件或模块。
4. 考虑过的取舍。

只有在以下情况下，才选择最小改动方案：

- 用户明确要求 hotfix、quick patch、minimal change 或最小改动。
- 当前改动风险较高，故意选择更窄的安全修复。
- 更大的重构缺乏足够上下文，容易变成无根据的过度设计。

不要把“我只做了最小改动”当成优点。本项目更重视干净、一致、稳定、可扩展的实现。

## 重构策略

在能改善实现质量的前提下，允许并鼓励重构。

不要因为某种结构已经存在，就默认保留它。如果现有模式不清晰、不一致或不利于扩展，应该优先替换为更好的结构，而不是继续在上面叠补丁。

允许的重构包括：

- 重命名不清晰的变量、函数、文件或组件。
- 将逻辑移动到更合适的模块。
- 调整组件边界。
- 更新数据模型或类型定义。
- 删除死代码。
- 用明确的状态模型或领域模型替代零散条件判断。
- 合并重复逻辑。
- 改进校验、错误处理和边界处理。

重构必须有明确目的：需要说明为什么要重构，并且保持和当前任务相关。不要做无关重构、无关格式化、无关依赖升级。

## 开发与验证规则

- 开发者通常已自行启动 dev 服务，可以直接访问，不要轻易执行 `npm run dev`。
- 默认不用内置预览检查每个小改动。只有用户明确要求使用预览时，才使用内部预览，并默认切换到 PC 视口，推荐尺寸为 `1440x900`。
- 修改 TypeScript、React、API、Prisma、Schema 或校验逻辑后，应优先运行与改动相关的检查。
- 代码或类型改动后，优先运行 `npm run typecheck`。
- React、Next.js、可访问性或常规代码质量相关改动后，优先运行 `npm run lint`。
- API、服务端、Prisma 或构建相关改动后，按风险运行 `npm run build`。
- Prisma schema 或数据库访问相关改动后，按需运行 `npm run db:generate`、`npm run db:migrate`、`npm run db:seed`。
- 当前没有 `npm test` 命令；除非先更新 `package.json` 增加测试脚本，否则不要声称已运行 `npm test`。
- 如果没有运行检查，完成总结中必须说明原因。
- 对新增的核心文件、复杂函数、关键数据结构添加简短注释。
- 不要为显而易见的代码添加重复解释型注释。

## 调试与日志规则

- 当用户说“看一下 log”、“看一下日志”时，先读取 `codex_logs/ai_trace_log.js`，用于分析 AI 调用链路与预期不符的原因。
- 当用户明确提出看“错误日志”，或问题表现为终端报错、编译失败、启动失败、运行时报错时，同时读取 `codex_logs/error_log.js`。
- 分析 AI 或聊天异常时，优先沿 `app/api/chat/route.ts`、`features/chat/hooks/use-chat-controller.ts`、`features/chat/lib/workout-plan-trigger.ts`、下游 `/api/ai/*` 路由和 trace 日志排查，不要先凭印象猜。

## Git 提交规则

- 只有在实际修改代码、文档或配置后，才需要提交 commit。
- 完成一次用户请求对应的完整改动后，如果相关检查无错误，则自动提交一次 commit。
- commit message 使用中文提交说明。
- 不要 amend、rebase 或改写已有提交，除非用户明确要求。
- 如果工作区已有无关未提交改动，不要纳入本次提交。

## 架构规则

- 保持 UI 层、API 层、AI 编排层、领域服务层和数据访问层之间的职责分离。
- 不要把业务逻辑直接写在 API Route 中。
- 不要在 UI 组件中直接调用数据库或 AI 服务。
- 确定性的健身业务规则应放在领域服务中。
- AI 编排逻辑应与数据校验、权限控制和持久化逻辑分离。
- API Route 入参必须用 Zod 或等价 schema 校验。
- 服务端错误响应优先复用现有 `jsonApiError`、`NextResponse.json` 模式，不要返回不一致的结构。

## AI 规则

- 模型生成的数据必须使用 Structured Outputs、Zod Schema 或 JSON Schema 进行结构约束。
- 所有模型输出在保存或执行前都必须经过服务端校验。
- Tool Calling 必须通过服务端函数执行。
- AI 不能直接写入未经校验的训练计划。
- AI 选择或生成的 `exerciseId` 必须经过数据库校验。
- 不要向 AI 工具暴露任意 SQL 查询能力。
- 聊天相关 UI 动作优先走模型输出的专用字段或 JSON trigger，不要从正文猜业务动作。
- 聊天意图解析默认避免隐藏重试；出现空回复或格式漂移，优先补 API 级约束和 prompt 规则，不要偷偷多发一次模型调用。
- 新增下游 AI 路由时，优先接入 `parentTraceId` 或 `existingTraceId`，保持一次对话一条 trace 的调试体验。

## 健身领域规则

- LLM 负责理解和生成，后端服务负责规则约束和最终执行。
- 训练计划必须尊重用户的目标、伤病情况、可用器械、训练经验和可用时间。
- 保存到系统中的训练动作必须来自数据库。
- 对新手、疼痛用户或有伤病限制的用户，应避免高风险或高冲击动作。
- 不要提供医疗诊断或治疗建议。
- 单次训练语义如“今天”“这次”“30分钟”“在家”“只有自重”默认按 routine 处理，不要误触长期 plan。

## 数据规则

- PostgreSQL 是系统事实数据来源。
- 使用 Prisma 进行数据库访问。
- 所有用户输入必须使用 Zod 校验。
- 所有 AI 输出必须使用 Zod 或 JSON Schema 校验。
- 所有用户私有数据查询都必须基于 `userId` 做权限隔离。
- 优先使用结构化数据库过滤，再使用向量检索或语义排序。
- `data/exercises.zh.json` 是 seed 数据来源；运行时业务数据优先来自数据库。

## 安全规则

- 不要绕过权限校验。
- 不要信任客户端输入。
- 不要持久化未经校验的原始 AI 输出。
- AI 接口必须做限流和成本控制。
- 记录 AI 输出校验失败和工具调用失败日志。
- 不要把 API key、数据库连接串或用户私有数据写入前端代码、OpenSpec artifact 或日志样例。

## 前端项目约定

- 整体界面以浅色 Material Design 3 风格为主，不在常规页面中使用大面积深色卡片。
- 页面背景、卡片、导航、抽屉、训练摘要、AI 建议和数据统计优先使用白色、浅灰、浅蓝等浅色 surface 层级。
- 图标优先使用 Material Symbols Outlined，沿用 `components/app/symbol-icon.tsx`。
- 优先使用 Tailwind token：`canvas`、`panel`、`panel-soft`、`ink`、`muted`、`line`、`primary`、`primary-soft`、`danger` 等。
- 动作卡片圆角控制在 12px；图片容器 8px；输入框、按钮、导航项 12px；大型摘要卡片 20px；标签 8px 或胶囊。
- 响应式布局必须确保内容不会被剪裁、遮盖或重叠。
- 若用户说“只改样式”，不要改 prompt 文案、快捷入口语义、业务交互或 API 行为。
- 可见文案默认简体中文、简洁、直接，少用英文副标题和装饰性 dashboard 文案。
- 页面级组件优先放在对应 `features/*/components`；跨页面 shell 与导航放在 `components/app`。

## 禁止事项

- 不要在没有 OpenSpec change 的情况下实现必须先走 OpenSpec 的需求。
- 不要实现用户没有要求的业务需求。
- 不要做无关重构、无关格式化、无关依赖升级。
- 不要凭空编造目录、命令、测试脚本、API 或产品状态。
- 不要把服务端代码导入前端组件。
- 不要把数据库访问、AI 调用或权限逻辑写进 UI 组件。
- 不要把复杂业务逻辑堆在 API Route 中。
- 不要绕过 Zod、Prisma 或服务端校验来“先跑通”。
- 不要在未确认的情况下运行破坏性 git 命令或数据库重置命令。
- 不要把 `.codex/skills`、`openspec/changes/archive` 或用户无关改动顺手纳入提交。
