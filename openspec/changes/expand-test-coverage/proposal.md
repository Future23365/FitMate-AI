## Why

当前项目的自动化测试覆盖明显不足：`app/`、`features/`、`lib/` 下约 62 个 TypeScript/React 文件，`tests/` 仅有 4 个手写逻辑测试文件，且主要覆盖训练计划候选、语音提示和一部分聊天服务边界。API 路由、动作库查询、聊天上下文、AI 推荐、训练 timeline、持久化服务和关键前端交互仍缺少稳定回归测试。

## What Changes

- 在正式测试流程接入后，系统性补充核心业务和高风险路径的测试用例。
- 优先覆盖确定性逻辑：Schema、解析器、动作筛选、训练计划校验、训练 timeline、聊天 trigger、上下文保留、API 入参校验和错误映射。
- 补齐服务端边界测试：动作库服务、训练计划生成前后校验、动作推荐候选、聊天历史服务、workout persistence 服务和 Route Handler 的轻量集成验证。
- 为关键前端逻辑补充 hook/工具函数级测试，并对训练执行页、动作预览、推荐卡片等高风险交互保留浏览器验收任务。
- 不在本变更中改变业务行为、API 契约、AI prompt、模型调用次数、数据库结构或页面 UI。

## Capabilities

### New Capabilities

- `test-coverage`: 约束项目应补充的核心自动化测试范围、测试优先级、测试数据策略和高风险流程验收标准。

### Modified Capabilities

无。

## Impact

- 影响 `tests/` 目录，可能新增按领域拆分的测试文件，例如聊天、动作库、训练计划、训练执行、持久化和 API route 测试。
- 影响部分业务模块的可测试性，可能需要导出少量纯函数或把确定性逻辑下沉到 `lib/shared/*` / `lib/server/*`。
- 依赖 `formalize-testing-workflow` 中的正式测试 runner 和 `npm test` 脚本先落地。
- 可能需要补充测试 fixture 或工厂函数，避免测试直接依赖完整 UI 或真实 AI 调用。
- 不影响运行时用户流程、数据库迁移、第三方 API 调用或生产配置。
