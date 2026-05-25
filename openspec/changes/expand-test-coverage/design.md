## Context

当前测试状态不是少量缺口，而是测试体系刚起步：

- `package.json` 仍未提供 `npm test`，正式 runner 的接入已由 `formalize-testing-workflow` change 约束。
- `tests/` 只有 4 个文件，且仍使用 `console.assert` 手写 runner。
- `app/`、`features/`、`lib/` 下约 62 个 TypeScript/React 文件，核心行为分布在 API route、AI 编排、动作库服务、训练计划校验、训练执行 timeline、聊天上下文、持久化服务和前端 hooks/组件中。
- 当前测试覆盖了部分训练计划候选、保存结构转换、语音 cue、语音播报控制器和聊天服务边界，但没有系统覆盖 API 入参、错误映射、动作库筛选、conversationContext、trigger 解析、训练 timeline、workout persistence 和推荐卡片相关逻辑。

这次 change 的目标不是直接把覆盖率做满，而是建立一组优先级清晰、可以分批落地的测试用例范围。

## Goals / Non-Goals

**Goals:**

- 补齐核心业务规则和高风险回归路径的自动化测试。
- 优先测试确定性逻辑，不依赖真实 AI 调用、真实数据库或真实浏览器计时。
- 为 API route、服务层、共享领域逻辑和前端业务 hooks 建立分层测试策略。
- 让后续改聊天、训练计划、动作筛选、训练执行页时能通过相关测试快速发现行为回归。
- 保留必要的 Chrome DevTools MCP 验收，用于自动化单元测试难以覆盖的页面渲染和交互。

**Non-Goals:**

- 不引入覆盖率阈值作为本次交付门槛。
- 不要求一次性给所有 React 组件写快照测试。
- 不访问真实 DeepSeek/OpenAI 接口，不记录真实用户数据，不依赖真实生产数据库。
- 不改变现有业务行为、API 契约、AI prompt、模型调用次数或 Prisma Schema。
- 不把 UI 视觉检查完全自动化；视觉和交互仍按项目浏览器验证规则处理。

## Decisions

### 1. 以风险和稳定性排序测试补充

测试补充优先级如下：

1. `lib/shared/*` 纯逻辑：训练 timeline、估算、Schema、聊天上下文、trigger 解析。
2. `lib/server/*` 确定性服务：动作候选、计划校验、动作库查询、trace store、错误映射和可 mock 的 persistence 转换。
3. `app/api/*` route：请求校验、状态码、错误响应和不触发真实 AI/数据库的边界路径。
4. `features/*` 中可拆出的确定性逻辑：推荐刷新去重、卡片 trigger、保存训练转换、前端请求封装错误处理。
5. 关键页面交互：用 Chrome DevTools MCP 验证，不优先写脆弱的 DOM 快照。

备选方案是先按文件数量平均补测试。这个方案看起来覆盖广，但会把精力消耗在低风险 UI 展示代码上，无法优先保护聊天、AI 编排和训练规则这些更容易产生业务回归的路径。

### 2. 测试数据使用 fixture 和工厂函数

测试应新增小型 fixture 或工厂函数，用于构造 `Exercise`、`WorkoutItem`、`WorkoutPlanIntent`、`WorkoutPlanDraft`、聊天消息和 API request。测试数据必须最小化，能表达场景即可，不直接复制完整 `data/exercises.zh.json` 到每个测试。

现有测试可以继续在少量集成场景中读取 `data/exercises.zh.json`，例如验证真实动作数据能支撑候选筛选。但大多数单元测试应使用明确 fixture，避免测试结果被动作库数据治理变化误伤。

备选方案是所有测试都用真实数据文件。这个方案能贴近当前数据，但会让规则单元测试和数据内容耦合过重，数据修订时容易出现大量非行为回归失败。

### 3. AI 相关测试只测边界和确定性分支

AI 编排测试不应调用真实模型。应覆盖以下内容：

- 请求 Schema 和消息窗口选择。
- `conversationContext` 的构建、合并、格式化和 fallback。
- trigger JSON 解析和业务 action 推导。
- 高风险健康词拦截、候选不足降级、输出 JSON 解析失败和校验失败。
- `parentTraceId`、token usage 和 trace metadata 的确定性传递。

如果现有函数不可直接测试，应优先抽出纯函数或注入请求函数，而不是在测试中 monkey patch 全局网络调用。

### 4. Route Handler 测试保持轻量

Route Handler 测试只覆盖 HTTP 边界：请求解析、Zod 校验、状态码、错误 body、权限 userId 传递和服务调用参数。业务分支应下沉到服务层测试，不在 route 测试中重复完整业务断言。

涉及真实 AI、Prisma 或长链路的 route，应通过依赖注入或可 mock 服务入口隔离外部依赖。不能隔离时，先在 tasks 中标记需要重构的测试 seam，并把完整链路留给手动/浏览器验收。

### 5. 前端测试只覆盖业务状态，不做脆弱快照

前端测试优先覆盖 hooks、解析器、请求封装和关键状态转换，例如推荐卡片“换一批/不喜欢/编成训练”的 id 去重、聊天流事件处理、保存训练数据转换。训练执行页这种强计时和浏览器 API 页面，单元测试只覆盖 timeline 和语音控制器，页面集成继续用 Chrome DevTools MCP 验证。

备选方案是给页面组件写大量快照。快照对当前快速迭代 UI 的收益低，且容易把样式调整变成测试噪音。

## Risks / Trade-offs

- [Risk] 测试补充范围过大，单次实现容易失控。→ Mitigation: tasks 按领域分组，先保护高风险纯逻辑和服务边界，再补 UI 交互验收。
- [Risk] 为了测试导出过多内部函数，破坏模块封装。→ Mitigation: 只导出稳定纯函数；不稳定细节通过公开服务入口或 fixture 验证。
- [Risk] 真实数据 fixture 和规则测试耦合。→ Mitigation: 单元测试用小 fixture，少量集成测试用真实 `data/exercises.zh.json`。
- [Risk] API route 测试需要 mock Prisma 或 AI 服务。→ Mitigation: route 只测边界；复杂逻辑下沉到可 mock 的服务层。
- [Risk] UI 自动化测试维护成本高。→ Mitigation: 单元测试覆盖业务状态，页面渲染和交互按需使用 Chrome DevTools MCP 验收。

## Migration Plan

1. 等 `formalize-testing-workflow` 完成正式 test runner 和现有测试迁移后，再实施本 change。
2. 新增 `tests/fixtures/*` 或相近测试工厂，统一构造动作、计划、聊天和 API request 数据。
3. 分批补充共享领域逻辑测试、服务层测试、API route 测试和前端业务逻辑测试。
4. 对需要轻微重构才能测试的模块，先抽出纯函数或服务入口，再补测试。
5. 每批测试补充后运行 `npm test`、`npm run typecheck` 和必要的 `npm run lint`；涉及路由/构建边界时运行 `npm run build`。

## Open Questions

无需要产品确认的问题。实现时如果发现某个模块必须先完成 `formalize-testing-workflow` 或其它架构 change，应该在 tasks 中保留依赖顺序，不跳过测试目标。
