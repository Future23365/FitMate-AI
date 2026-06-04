## 1. 当前入口复核

- [x] 1.1 复核当前 `/api/chat -> agent-text-chat-service -> LlmPlanner -> DeepSeekModelAdapter` 链路，确认默认 system prompt 的真实硬编码位置。
- [x] 1.2 复核当前 `agent-core` / `agent-planners` 边界，确认 prompt 抽离不需要修改 `PlannerPort`、runtime loop、Executor、Policy Guard、ResourceStore 或 Response Renderer。
- [x] 1.3 复核现有 prompt 相关文档，列出仍引用旧 `lib/server/ai/prompt-config.ts` 的滞后说明。

## 2. Prompt 配置抽离

- [x] 2.1 新增 Agent LLM prompt 配置模块，定义 `AgentLlmPromptConfig`、默认配置、`promptVersion` 和 system prompt builder。
- [x] 2.2 将当前 DeepSeek system prompt 文案迁移到配置模块，保持语义不变。
- [x] 2.3 调整 `DeepSeekModelAdapter`，通过构造参数或默认配置读取 prompt，不在请求构造函数中硬编码默认 prompt 文案。
- [x] 2.4 保持生产 planner factory 使用默认 prompt 配置，不改变 `/api/chat` 外部请求 schema、NDJSON 事件合同或用户可见业务能力。

## 3. 边界防护

- [x] 3.1 确认 prompt 配置模块只描述通用 `AgentAction` 合同、输出格式和安全边界。
- [x] 3.2 确认 prompt 配置模块不包含 `searchExercises`、动作库、训练生成、保存 artifact、用户记忆、推荐卡片或具体业务 toolName 的流程说明。
- [x] 3.3 确认本 change 不注册 fixture tool、真实业务 tool，也不新增 `/api/chat` 关键词、正则、同义词或短句模板分流。

## 4. 测试与扫描

- [x] 4.1 增加 prompt 配置单元测试，覆盖默认 prompt、`promptVersion` 和 system prompt builder。
- [x] 4.2 增加 `DeepSeekModelAdapter` 请求体测试，证明 system message 来自默认 prompt 配置。
- [x] 4.3 增加自定义 prompt 配置注入测试，证明 adapter 可使用测试配置且不污染默认配置。
- [x] 4.4 增加或扩展架构扫描，证明 `agent-core` 不导入 prompt 配置或 DeepSeek 协议，prompt 配置不导入业务 tool、Prisma、动作库服务、训练生成服务或旧 `agent-orchestrator`。
- [x] 4.5 运行相关自动化测试，按需运行 `npm test -- tests/agent-core`、`npm run typecheck` 和 OpenSpec strict 校验。

## 5. 文档同步

- [x] 5.1 更新 prompt 说明文档，指向新的 Agent LLM prompt 配置入口，并说明旧 `lib/server/ai/prompt-config.ts` 不再是当前生产入口。
- [x] 5.2 更新 `docs/agent-tool-orchestrator-design.md`，记录 prompt 配置与 `agent-planners` / model adapter 的边界。
- [x] 5.3 按项目规则新增 `docs/方案变更历史` 记录，并在 `docs/项目演变历程.md` 追加本次 prompt 配置抽离。
- [x] 5.4 最终检查 `git diff`，确认只包含 prompt 配置抽离、相关测试和必要文档，不混入业务 tool 或训练逻辑。
