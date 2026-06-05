## 1. 配置结构设计

- [x] 1.1 新增 `lib/server/config/`，建立 Agent 配置文件边界，避免客户端、route、tool handler 或数据库服务反向依赖配置模块。
- [x] 1.2 新增集中 Agent runtime TS config，分组定义 `llm`、`runtime`、`tools`、`trace` 配置。
- [x] 1.3 为每个导出的配置对象和核心配置项添加简短中文注释，说明用途、影响链路和调整风险。
- [x] 1.4 保留 `DEEPSEEK_API_KEY`、`DEEPSEEK_API_URL`、`DEEPSEEK_MODEL` 现有环境变量边界，不新增 runtime budget 的 env override。

## 2. Prompt 配置迁移

- [x] 2.1 将 `agent-llm-prompt-config.ts` 的生产默认 prompt 配置迁移到 `lib/server/config/`。
- [x] 2.2 保留 `agentLlmPromptVersion`、`agentLlmPromptConfig`、`buildAgentActionSystemPrompt()` 和测试注入自定义 prompt 配置的能力。
- [x] 2.3 更新 `DeepSeekModelAdapter`、prompt tests、adapter tests 和文档引用，使其指向新的 prompt 配置入口。
- [x] 2.4 删除旧 prompt 配置文件，或只保留短期 re-export 并在注释和测试中说明清理条件。

## 3. 生产链路消费集中配置

- [x] 3.1 更新 `DeepSeekModelAdapter`，从集中配置读取默认 `temperature`、`maxTokens` 和模型请求 timeout，并继续允许测试显式覆盖。
- [x] 3.2 更新 `/api/chat` 文本聊天 run input 构造，从集中配置读取 `maxSteps`、`maxPlannerCalls`、`maxToolCalls`、`maxInvalidActions`、`maxRepairAttempts`、`overallTimeoutMs` 和 `perToolTimeoutMs`。
- [x] 3.3 更新 `searchExerciseResources` 相关 repository/tool 默认返回数量，从集中配置读取每个 section 的可见动作数量，并保留 hard cap。
- [x] 3.4 更新 `resolveExerciseResourceMentions` 默认 `maxMatches` 来源，并保留最大匹配 hard cap。
- [x] 3.5 更新 `inspectVisibleTrainingProposals(list_recent)` 最近事实数量来源，并保留 fact store hard cap。
- [x] 3.6 更新模型 trace preview 和 long text chunk 配置来源，避免 adapter 内继续散落 trace 长度常量。

## 4. 边界清理

- [x] 4.1 用 `rg` 检查 `maxTokens`、`max_tokens`、`maxSteps`、`maxPlannerCalls`、`maxToolCalls`、`maxRepairAttempts`、`overallTimeoutMs`、`perToolTimeoutMs`、tool timeout 和 tool 返回数量是否仍有生产内联默认值。
- [x] 4.2 确认 `lib/server/config/` 不导入 `/api/chat` route、业务 tool handler、Response Renderer、Prisma 服务、旧 `agent-orchestrator` 或客户端模块。
- [x] 4.3 确认本 change 没有新增业务 tool、服务端自然语言关键词分流、隐藏训练生成服务或用户可见 API 契约变化。

## 5. 文档同步

- [x] 5.1 更新 prompt 或 Agent 配置相关文档，说明当前生产 prompt 和 runtime config 入口位于 `lib/server/config/`。
- [x] 5.2 在 `docs/方案变更历史/` 新增一份带上海时间的变更记录，说明为什么从分散常量调整为集中 TS config。
- [x] 5.3 如实现影响核心链路理解，在 `docs/项目演变历程.md` 末尾追加简要记录。

## 6. 测试与验证

- [x] 6.1 更新并运行 `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts tests/agent-core/adapter-llm-planner.test.ts`。
- [x] 6.2 更新并运行覆盖 `/api/chat` run input limits 的相关测试，例如 `npm test -- tests/chat-service.test.ts`。
- [x] 6.3 更新并运行 tool 相关测试，例如 `npm test -- tests/agent-tools/search-exercise-resources.test.ts tests/agent-tools/resolve-exercise-resource-mentions.test.ts tests/agent-tools/inspect-visible-training-proposals.test.ts`。
- [x] 6.4 更新并运行 architecture boundary 扫描，例如 `npm test -- tests/agent-core/architecture-boundary.test.ts`。
- [x] 6.5 运行 `openspec validate centralize-agent-runtime-config --strict`。
- [x] 6.6 运行 `npm run typecheck`。
- [x] 6.7 运行 `npm run lint`。
