# AI 健身聊天助手技术架构文档

## 1. 项目定位

本项目定位为一个完整的 AI 健身助手产品，而不是简单的聊天 Demo 或动作库展示应用。

产品目标是通过自然语言交互理解用户的健身目标、身体状态、训练条件、时间安排和训练偏好，并基于结构化健身数据生成、调整和执行个性化训练计划。

系统需要覆盖以下核心能力：

- AI 聊天交互
- 用户健身画像管理
- 动作库管理
- 训练计划生成
- 多轮对话修改计划
- 训练执行与计时
- 训练反馈收集
- 长期个性化调整
- Agent 化工具调用
- 知识库与语义检索扩展

整体方向不是做一个“LLM 包装层”，而是构建一个由前端体验、后端业务、数据库、AI 编排、知识检索和训练执行系统共同组成的完整健身产品。

---

## 2. 总体技术架构

推荐采用现代 TypeScript 全栈架构，前期保持单体模块化，后期可按业务复杂度拆分服务。

整体技术栈方向：

| 层级 | 推荐技术 |
|---|---|
| 前端应用 | Next.js App Router、React、TypeScript |
| UI 与样式 | Tailwind CSS、shadcn/ui、Framer Motion |
| 服务端接口 | Next.js Route Handlers / Server Actions |
| 业务服务层 | TypeScript Service Layer |
| 数据库 | PostgreSQL |
| ORM | Prisma |
| 缓存 | Redis |
| 队列任务 | BullMQ / Inngest |
| AI 模型调用 | OpenAI SDK / Vercel AI SDK |
| LLM 输出校验 | Zod、JSON Schema、Structured Outputs |
| Agent / 工具调用 | OpenAI Tool Calling / Vercel AI SDK Tools |
| 向量检索 | pgvector |
| 文件与媒体存储 | S3 / Cloudflare R2 / Supabase Storage |
| 鉴权 | Auth.js / Clerk |
| 部署 | Vercel + Neon / Supabase / Railway |
| 日志监控 | Sentry、PostHog、OpenTelemetry |
| 后台管理 | Next.js Admin Routes / Retool / 自建 Admin |

---

## 3. 架构分层

系统采用分层架构，每一层有明确的技术职责。

```txt
客户端应用层
  ↓
应用接口层
  ↓
AI 编排层
  ↓
业务领域服务层
  ↓
数据与知识层
  ↓
外部基础设施层
```

---

## 4. 客户端应用层

### 4.1 技术选择

推荐技术：

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Framer Motion
- Zustand
- React Hook Form
- Zod

### 4.2 使用范围

客户端应用层负责用户可见的产品体验，包括：

- 聊天页面
- 动作库页面
- 训练计划页面
- 训练执行页面
- 用户设置页面
- 训练历史页面
- 后续的移动端适配

### 4.3 技术职责

Next.js App Router 用于组织页面路由和服务端渲染。

React 用于构建交互式 UI。

TypeScript 用于统一前后端类型，减少数据结构不一致问题。

Tailwind CSS 用于快速构建响应式界面。

shadcn/ui 用于构建可复用的高质量组件，例如按钮、卡片、弹窗、表单、标签、抽屉和命令面板。

Framer Motion 用于训练执行页、页面切换、动作切换、计时器状态等动效。

Zustand 用于管理客户端局部状态，例如训练执行过程中的当前动作、当前组数、计时状态和临时 UI 状态。

React Hook Form + Zod 用于用户资料、训练偏好、计划编辑等表单场景。

---

## 5. 应用接口层

### 5.1 技术选择

推荐技术：

- Next.js Route Handlers
- Server Actions
- TypeScript
- Zod
- Auth.js / Clerk

### 5.2 使用范围

应用接口层负责连接前端、业务服务和 AI 编排层。

主要接口方向包括：

- 聊天接口
- 动作库查询接口
- 训练计划接口
- 训练执行接口
- 用户画像接口
- 文件上传接口
- 后台管理接口

### 5.3 技术职责

Next.js Route Handlers 用于承载需要 HTTP API 的能力，例如聊天、动作查询、计划生成、计划保存等。

Server Actions 可用于部分简单的数据变更，例如表单提交、计划收藏、用户设置更新等。

Zod 用于校验所有客户端传入参数，避免非法数据进入业务层。

Auth.js 或 Clerk 用于用户登录、会话管理和权限控制。

---

## 6. AI 编排层

### 6.1 技术选择

推荐技术：

- OpenAI SDK
- Vercel AI SDK
- Structured Outputs
- Tool Calling
- Zod
- 自定义 Orchestrator
- 后期可选 LangGraph

### 6.2 使用范围

AI 编排层负责把用户自然语言转化为系统可以执行的结构化任务。

主要能力包括：

- 用户意图识别
- 用户画像抽取
- 缺失信息追问
- 动作检索工具调用
- 训练计划生成
- 计划修改
- 训练反馈理解
- 健身知识问答
- Agent 化任务执行

### 6.3 技术职责

OpenAI SDK 用于直接调用大模型、Structured Outputs、Tool Calling 和 Embeddings。

Vercel AI SDK 可用于构建流式聊天响应、统一模型调用、工具调用和前后端 AI 状态管理。

Structured Outputs 用于约束模型输出结构，例如用户画像、训练计划、动作替换请求等。

Tool Calling 用于让模型在受控范围内调用系统工具，例如查询动作、获取动作详情、创建训练计划、替换动作等。

Zod 用于在服务端再次校验模型输出，避免模型生成不可执行或不安全的数据。

自定义 Orchestrator 用于编排 AI 工作流，例如：

```txt
理解用户 → 查询动作 → 生成计划 → 校验计划 → 保存计划
```

当前聊天链路由服务端维护自然语言 `conversationSummary`。`/api/chat`、`/api/ai/workout-plan` 和 `/api/ai/exercise-recommendations` 的模型可见输入只包含 `conversationSummary` 与当前最新用户消息；完整历史消息窗口和旧结构化 `conversationContext` 不再传给模型。结构化 `assistant_action`、`workoutIntent`、候选动作和草稿校验仍保留在服务端内部，用于权限隔离、动作库约束和最终执行。

聊天链路在意图解析后通过 `ReferenceResolver` 解析“这个”“刚才那套”“之前练胸那套”等历史引用。解析结果必须来自当前用户可访问的 recent artifact summaries 或 `ArtifactIndex` 候选集合；歧义和未找到会在 `/api/chat` 直接澄清，完整 artifact payload 只能通过服务端 `getArtifactPayload` 校验后读取。

LangGraph 可以作为后期选择，用于构建更复杂的 Agent 状态机和多步骤任务流，但不建议一开始就引入。

---

## 7. 业务领域服务层

### 7.1 技术选择

推荐技术：

- TypeScript Service Layer
- Prisma
- Zod
- Domain Services
- Repository Pattern 可选

### 7.2 使用范围

业务领域服务层承载真正的健身业务逻辑，不能全部交给 LLM。

主要领域包括：

- 用户画像服务
- 动作库服务
- 训练计划服务
- 训练执行服务
- 训练反馈服务
- 计划调整服务
- 内容管理服务

### 7.3 技术职责

TypeScript Service Layer 用于组织业务逻辑，避免所有逻辑堆在 API Route 中。

Prisma 用于数据库访问。

Zod 用于业务入参与业务结果校验。

领域服务负责沉淀确定性规则，例如：

- 用户是新手时避免高难度动作
- 没有器械时只选择自重动作
- 每次训练时长不能明显超出用户要求
- 计划中的动作必须来自数据库
- 训练量不能明显不合理

这一层是系统长期价值所在。AI 负责理解和生成，业务领域服务负责约束和执行。

---

## 8. 数据与持久化层

### 8.1 技术选择

推荐技术：

- PostgreSQL
- Prisma
- Redis
- pgvector
- S3 / Cloudflare R2 / Supabase Storage

### 8.2 PostgreSQL 使用范围

PostgreSQL 作为核心业务数据库，负责保存系统事实数据。

主要数据包括：

- 用户
- 用户画像
- 动作库
- 训练计划
- 训练日
- 计划动作
- 训练执行记录
- 聊天会话
- 用户反馈
- 内容管理数据

PostgreSQL 是系统的事实来源。LLM 生成的内容必须经过校验后才能进入数据库。

### 8.3 Prisma 使用范围

Prisma 用于：

- 数据模型定义
- 类型安全查询
- 数据迁移
- Seed 脚本
- 关系查询
- 本地开发调试

Prisma 的优势是与 TypeScript 结合紧密，适合当前项目的全栈技术方向。

### 8.4 Redis 使用范围

Redis 用于处理高频、临时或性能敏感的数据。

适合场景：

- 聊天会话短期缓存
- AI 请求结果缓存
- 限流
- 临时训练执行状态
- 队列任务状态
- 热门动作缓存

### 8.5 pgvector 使用范围

pgvector 用于向量检索，适合后期引入 RAG 和语义搜索。

适合场景：

- 根据自然语言搜索动作
- 查找类似动作
- 健身知识库检索
- 用户偏好语义匹配
- 计划修改时查找替代动作

不建议用向量检索替代结构化查询。推荐采用混合检索：

```txt
PostgreSQL 结构化过滤
  +
pgvector 语义排序
  +
业务规则校验
```

### 8.6 对象存储使用范围

S3、Cloudflare R2 或 Supabase Storage 用于保存动作图片、动作视频、用户上传文件等媒体资源。

动作库中的图片和视频不建议长期依赖第三方原始链接，后期应同步到自己的对象存储中，保证访问稳定性和资源可控性。

---

## 9. 健身数据架构

### 9.1 技术选择

推荐技术：

- PostgreSQL
- Prisma Seed
- 自定义数据导入脚本
- 后台内容管理系统
- 对象存储

### 9.2 数据来源方向

动作数据可以来自：

- yuhonas/free-exercise-db
- wger
- exercemus/exercises
- 自建动作库
- 后期商业授权数据源

早期可以使用开源动作库作为基础数据源，后期逐步建设自有标准化动作库。

### 9.3 数据处理方向

动作数据不应直接原样使用，而应经过：

- 导入
- 清洗
- 去重
- 字段标准化
- 中文补充
- 风险标签补充
- 默认训练参数补充
- 媒体资源整理
- 版权与来源标记

技术上可以通过数据导入脚本和后台管理系统逐步完成。

### 9.4 动作库维护方向

完整项目需要后台内容管理能力，推荐使用：

- 自建 Next.js Admin
- Retool
- NocoDB
- Supabase Studio

后台主要用于：

- 编辑动作名称
- 管理动作分类
- 管理肌群标签
- 管理器械标签
- 管理动作图片和视频
- 管理动作风险标签
- 审核 AI 生成或导入的数据

---

## 10. RAG 与知识检索层

### 10.1 技术选择

推荐技术：

- OpenAI Embeddings
- pgvector
- PostgreSQL
- 自定义 Retrieval Service
- 后期可选 LangChain / LlamaIndex

### 10.2 使用范围

RAG 不用于替代核心业务数据库，而用于增强语义理解和知识问答。

适合场景：

- 健身知识问答
- 训练原则解释
- 动作注意事项说明
- 自然语言搜索动作
- 类似动作推荐
- 计划调整理由解释
- 用户模糊需求匹配

### 10.3 架构方向

推荐采用混合检索：

```txt
用户自然语言
  ↓
结构化条件抽取
  ↓
SQL 硬过滤
  ↓
向量语义检索
  ↓
业务规则校验
  ↓
返回候选结果给 LLM
```

这样既能保证动作和计划来自数据库，又能处理用户自然语言中的模糊表达。

### 10.4 LangChain / LlamaIndex 的位置

第一阶段不建议强依赖 LangChain 或 LlamaIndex。

原因是当前项目的核心数据是结构化数据，直接使用 PostgreSQL、Prisma、OpenAI SDK 和 pgvector 更清晰、更可控。

当知识库复杂度提高后，可以考虑引入：

- LangChain：用于复杂工具链和 Agent 流程
- LangGraph：用于多步骤 Agent 状态机
- LlamaIndex：用于知识库索引和文档检索

---

## 11. Agent 与工具调用层

### 11.1 技术选择

推荐技术：

- OpenAI Tool Calling
- Vercel AI SDK Tools
- Zod Tool Schemas
- 自定义 Agent Loop
- 后期可选 LangGraph

### 11.2 使用范围

Agent 化能力用于让 AI 在明确边界内调用系统能力，而不是自由访问系统。

可开放给 AI 的工具包括：

- 查询动作
- 获取动作详情
- 查询用户画像
- 查询训练历史
- 创建训练计划
- 替换计划动作
- 调整训练强度
- 记录用户反馈

### 11.3 技术边界

每个工具都必须具备：

- 明确的入参 Schema
- 明确的返回结构
- 权限控制
- 服务端校验
- 日志记录
- 失败处理

AI 可以决定调用哪个工具，但工具执行必须由服务端完成。

Agent 不应该拥有以下能力：

- 任意 SQL 查询
- 绕过权限访问用户数据
- 直接写入未经校验的训练计划
- 生成不存在于数据库中的动作

---

## 12. 训练计划生成架构

### 12.1 技术选择

推荐技术：

- OpenAI Structured Outputs
- Zod
- Prisma
- PostgreSQL
- 自定义 Plan Generator Service
- 自定义 Plan Validator Service

### 12.2 架构方向

训练计划生成应由多个模块协作完成：

```txt
用户画像
  +
动作候选集
  +
训练规则
  +
LLM 生成
  +
后端校验
  =
可执行训练计划
```

### 12.3 职责划分

LLM 负责：

- 理解用户目标
- 组织训练结构
- 生成自然语言解释
- 在候选动作中选择组合

后端负责：

- 查询候选动作
- 控制可选动作范围
- 校验动作 ID
- 校验训练强度
- 保存训练计划
- 管理计划版本

数据库负责：

- 保存动作事实数据
- 保存计划结构
- 保存训练记录
- 保存用户反馈

---

## 13. 训练执行系统

### 13.1 技术选择

推荐技术：

- React
- Zustand
- Framer Motion
- Web Audio API 可选
- Notification API 可选
- PostgreSQL
- Redis 可选

### 13.2 使用范围

训练执行系统负责用户真正跟练的体验。

核心能力包括：

- 当前动作展示
- 组数进度
- 动作计时
- 休息计时
- 动作切换
- 完成记录
- 训练反馈

### 13.3 技术职责

React 负责交互界面。

Zustand 负责训练过程中的本地状态，例如当前动作、当前组、剩余时间、暂停状态。

Framer Motion 负责动作切换和计时状态动效。

Web Audio API 可用于倒计时提示音。

Notification API 可用于训练提醒或休息结束提醒。

PostgreSQL 用于保存最终训练记录。

Redis 可用于保存临时训练状态，尤其是未来支持跨设备恢复训练时。

---

## 14. 用户系统与权限

### 14.1 技术选择

推荐技术：

- Auth.js
- Clerk
- PostgreSQL
- Prisma

### 14.2 使用范围

用户系统负责：

- 登录注册
- 第三方 OAuth 登录
- 会话管理
- 用户资料
- 权限控制
- 用户数据隔离

### 14.3 选型建议

如果希望快速产品化，可以选择 Clerk。

如果希望更可控、更贴近自建系统，可以选择 Auth.js。

用户训练数据、聊天记录、训练计划和用户画像都必须和 userId 绑定，避免跨用户访问。

---

## 15. 队列与异步任务

### 15.1 技术选择

推荐技术：

- BullMQ + Redis
- Inngest
- Vercel Cron
- GitHub Actions 可选

### 15.2 使用范围

异步任务适合处理不需要阻塞用户请求的任务。

典型场景：

- 动作数据导入
- 动作图片同步
- 生成动作 embedding
- 训练计划质量评估
- 用户训练统计计算
- 周期性训练提醒
- AI 生成结果审计

### 15.3 选型建议

如果项目部署在 Vercel 并希望简化后端任务，Inngest 是比较合适的选择。

如果希望自己掌控任务队列，可以使用 BullMQ + Redis。

---

## 16. 监控、日志与分析

### 16.1 技术选择

推荐技术：

- Sentry
- PostHog
- OpenTelemetry
- Vercel Analytics
- 自定义 AI 调用日志

### 16.2 使用范围

完整项目需要关注：

- 前端错误
- API 错误
- AI 调用失败
- AI 输出校验失败
- 用户行为路径
- 计划生成成功率
- 训练完成率
- 动作替换频率
- 用户反馈分布

### 16.3 AI 日志

AI 相关日志尤其重要，建议记录：

- 用户请求类型
- 使用的模型
- 工具调用过程
- 结构化输出是否成功
- 校验失败原因
- token 消耗
- 响应耗时

这些数据后期可以用于优化提示词、工具设计和计划生成质量。

---

## 17. 安全与风险控制

### 17.1 技术选择

推荐技术：

- Zod
- 服务端权限校验
- Rate Limiting
- Redis
- 内容安全策略
- AI Safety Guardrails

### 17.2 重点风险

健身产品需要保证模型输出和数据访问都受服务端结构化边界约束。

重点包括：

- 避免 LLM 幻觉动作
- 避免越权访问用户数据
- 避免无限制 AI 调用导致成本失控

### 17.3 技术措施

- 所有输入使用 Zod 校验
- 所有模型输出使用 Schema 校验
- 所有 exerciseId 必须查数据库确认
- 所有用户数据查询必须带 userId
- AI 接口使用限流和成本控制
- 关键业务变更记录日志

---

## 18. 部署架构

### 18.1 推荐起步部署

推荐技术组合：

```txt
Vercel
  +
Neon PostgreSQL / Supabase PostgreSQL
  +
Upstash Redis
  +
Cloudflare R2 / Supabase Storage
  +
OpenAI API
```

### 18.2 使用范围

Vercel 用于部署 Next.js 应用。

Neon 或 Supabase 用于托管 PostgreSQL。

Upstash Redis 用于缓存、限流和队列辅助能力。

Cloudflare R2 或 Supabase Storage 用于动作图片、视频和上传资源。

OpenAI API 用于聊天、结构化输出、工具调用和 embeddings。

### 18.3 后期扩展部署

随着项目复杂度提升，可以演进为：

- 独立 API 服务
- 独立 Worker 服务
- 独立队列消费者
- 独立内容管理后台
- 独立模型调用代理层

但早期不建议过早拆分微服务。

---

## 19. 推荐演进路线

### 阶段一：核心产品闭环

技术重点：

- Next.js
- PostgreSQL
- Prisma
- OpenAI SDK
- Zod
- Tailwind CSS
- shadcn/ui

目标能力：

```txt
聊天输入
→ 用户画像抽取
→ 动作库检索
→ 训练计划生成
→ 计划保存
→ 训练执行
→ 训练反馈
```

---

### 阶段二：用户个性化

技术重点：

- 用户系统
- 用户长期画像
- 训练历史
- 反馈分析
- Redis 缓存

目标能力：

```txt
系统记住用户偏好
根据历史训练调整计划
根据反馈替换动作或调整强度
```

---

### 阶段三：Agent 化

技术重点：

- Tool Calling
- Vercel AI SDK Tools
- 自定义 Agent Loop
- 工具权限控制
- 工具调用日志

目标能力：

```txt
AI 可以调用受控工具
支持多轮修改计划
支持查询历史和替换动作
```

---

### 阶段四：RAG 与语义检索

技术重点：

- OpenAI Embeddings
- pgvector
- Hybrid Retrieval
- Retrieval Service

目标能力：

```txt
自然语言动作搜索
类似动作推荐
健身知识问答
模糊需求匹配
```

---

### 阶段五：产品化扩展

技术重点：

- 后台管理
- 队列任务
- 对象存储
- 监控分析
- 通知系统
- 内容审核

目标能力：

```txt
动作库持续维护
AI 质量监控
用户训练数据分析
多端扩展
商业化基础设施
```

---

## 20. 总结

本项目推荐采用以下技术主线：

```txt
Next.js + TypeScript
  +
PostgreSQL + Prisma
  +
OpenAI SDK / Vercel AI SDK
  +
Zod Structured Validation
  +
Tool Calling
  +
pgvector
  +
Redis / Queue / Object Storage
```

核心架构判断是：

> AI 是健身产品中的智能编排层，不是唯一业务层。

系统应该由以下部分共同组成：

- 前端交互体验
- 后端业务服务
- 结构化动作库
- 用户长期画像
- 训练计划系统
- 训练执行系统
- AI 编排层
- Agent 工具调用层
- RAG 语义检索层
- 内容管理与监控系统

短期应优先完成稳定的产品闭环，长期再扩展 Agent、RAG、后台管理、多端体验和训练智能化能力。
