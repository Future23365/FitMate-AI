## 1. 现状确认与边界

- [x] 1.1 运行 `git status --short`，确认只剩无关 `next-env.d.ts` 脏改，并且本 change 不混入该文件。
- [x] 1.2 读取 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认本 change 不修改 Planner、Executor、Policy Guard、ResourceStore、Resource Contract Validator 或 Response Renderer 主流程。
- [x] 1.3 确认当前 `agentActivityDisplayByStage` 是前端用户安全文案白名单，不把中文文案搬进 tool 或 stream payload。

## 2. OpenSpec 验证

- [x] 2.1 运行 `openspec validate sync-agent-activity-tool-metadata --strict`。

## 3. Tool metadata 同步

- [x] 3.1 为 `searchExerciseResources` 声明 `uiActivityStage = "querying_exercises"`，保留原有 Planner 可见 `facetCatalog` metadata。
- [x] 3.2 为 `resolveExerciseResourceMentions` 声明 `uiActivityStage = "querying_exercises"`。
- [x] 3.3 为 `inspectVisibleTrainingProposals` 声明 `uiActivityStage = "reading_artifacts"`，不改变 resource contract。

## 4. Production chat adapter

- [x] 4.1 删除 `lib/server/chat/agent-text-chat-service.ts` 中具体业务 `toolName -> AgentProgressStage` 映射。
- [x] 4.2 保留 `tool.uiActivityStage` 优先、resource contract fallback、`analyzing_request` 兜底的映射顺序。
- [x] 4.3 确认没有新增服务端关键词、正则、同义词表、自然语言模板路由或基于用户原文的活动阶段推断。

## 5. 测试与验证

- [x] 5.1 新增或更新测试，证明现有生产 tool 的 `uiActivityStage` 与预期活动阶段同步，并且该字段不进入 Planner manifest。
- [x] 5.2 更新 architecture boundary，证明 chat service 不再维护具体业务 `toolName` 活动阶段表。
- [x] 5.3 运行 `npm test -- tests/chat-service.test.ts tests/agent-core/architecture-boundary.test.ts`。
- [x] 5.4 运行 `npm test -- tests/chat-agent-activity.test.ts`，确认前端文案白名单和本地 `#N` 展示不回归。
- [x] 5.5 运行 `npm run typecheck`。

## 6. 收口

- [x] 6.1 检查最终 diff，确认未混入 `next-env.d.ts`、未改 tool 业务语义、未改模型可见 prompt；除必需演变文档外未新增 OpenSpec 范围外文件。
- [x] 6.2 按项目规则提交中文 commit。
