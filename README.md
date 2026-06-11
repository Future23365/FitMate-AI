# FitMate AI

体验地址：[https://www.proshow.site/](https://www.proshow.site/)（香港服务器，大陆内访问较慢，建议使用代理环境体验）

FitMate AI 是一个 AI 健身聊天助手。系统通过自然语言理解用户的训练目标、可用时间、器械条件、身体限制和训练偏好，并结合数据库中的动作事实生成可展示、可校验的训练建议。

当前项目使用 PostgreSQL / Prisma 作为运行时事实数据源，使用 Next.js App Router 承载前端页面和 API Route。生产聊天链路通过 LangChain Agent Runtime 接入 DeepSeek native Tool Calling，模型输出在展示前会经过服务端结构校验、数据库事实校验和受控 response adapter 投影。

## 当前能力

- AI 聊天首页：支持历史会话、本地匿名用户、流式回复、Agent 活动状态、建议问题和训练方案卡片。
- 动作库：支持基于 PostgreSQL/Prisma 的动作搜索、筛选、详情查看和本地图片展示。
- 训练管理：支持动作编排、训练计划、训练日历、训练执行、完成状态同步。
- 生产 Agent：当前只开放只读业务 tool，用于读取动作资源和用户已见训练方案事实；不由模型直接保存、覆盖或执行训练计划。
- 调试与后台：提供 AI trace 调试页和只读 `/admin` AI usage 后台。
- 自动化验证：提供 Vitest、TypeScript、ESLint、构建检查和手动 LLM 黑盒测试入口。

## 快速开始

建议使用 Node.js 22，与当前 `Dockerfile` 中的容器运行基线保持一致。本地数据库通过 Docker Compose 启动。

```bash
npm install
cp .env.example .env.local
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:refresh-embeddings
npm run dev
```

本地 AI 聊天和手动 LLM 黑盒测试需要在 `.env.local` 中配置 `DEEPSEEK_API_KEY`。如果只验证非 AI 页面，缺少该 key 时聊天接口会返回稳定配置错误。

更多本地环境、环境变量和测试命令见：[docs/本地开发指南.md](./docs/本地开发指南.md)。

## 常用命令

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

`npm test` 不会调用真实模型；`npm run test:llm:basic` 通过真实 `/api/chat` + LangChain 主链执行，会调用模型并消费 token。

## 技术栈

- 前端：Next.js 16 App Router、React 19、TypeScript 5。
- UI：Tailwind CSS 4、shadcn/ui 风格组件、Radix UI、Material Symbols、lucide-react、Sonner。
- 服务端与数据：Next.js Route Handlers、PostgreSQL 17、Prisma 7、`@prisma/adapter-pg`、`pg`。
- AI 编排：LangChain Agent Runtime、DeepSeek native Tool Calling、服务端 LangChain tool wrapper。
- 校验与测试：Zod、JSON Schema、Vitest、ESLint、`tsc --noEmit`。
- 部署：Next.js standalone、Docker、Docker Compose、Caddy、GitHub Actions、GHCR。

## 文档入口

- [docs/本地开发指南.md](./docs/本地开发指南.md)：本地环境、环境变量、数据库初始化、测试和动作图片配置。
- [docs/项目部署指南.md](./docs/项目部署指南.md)：当前项目的 Docker / Caddy / GitHub Actions 部署流程和运维命令。
- [docs/项目结构说明.md](./docs/项目结构说明.md)：目录职责、前后端边界、API 路由和分层约定。
- [docs/architecture.md](./docs/architecture.md)：完整架构说明。
- [docs/agent-tool-orchestrator-design.md](./docs/agent-tool-orchestrator-design.md)：AgentLoop 和 tool orchestrator 架构设计。
- [docs/llm-prompt-guidance.md](./docs/llm-prompt-guidance.md)：Prompt 与模型可见输入设计规范。
- [docs/manual-llm-basic-blackbox-tests.md](./docs/manual-llm-basic-blackbox-tests.md)：基础 LLM 黑盒测试说明。

## 当前边界

- 当前身份体系是本地匿名 auth cookie，不是正式账号登录、权限后台或多端账号同步。
- 运行时动作事实以 PostgreSQL 为准，`data/exercises.zh.json` 只作为动作 seed 来源。
- 当前生产 Agent 不开放未经校验的写入型训练 tool；训练保存、日历安排和训练执行仍由页面已有业务入口完成。
- AI trace 面向开发和内测；公开环境只有显式设置 `ENABLE_AI_TRACE_LOG=true` 时才写入 trace。
