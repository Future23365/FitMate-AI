## 1. 迁移前审计和依赖确认

- [x] 1.1 运行 `git status --short`，确认实现分支没有无关大批量未提交改动；如超过 10 个无关文件或跨模块脏改，先暂停并处理工作区。
- [x] 1.2 复核当前生产链路，列出 `/api/chat`、`createAgentTextChatResponse()`、`runAgentRuntime()`、`LlmPlanner`、`DeepSeekModelAdapter`、旧 `ToolRegistry`、旧 Response Renderer、trace 写入和现有业务 tool 的真实调用关系。
- [x] 1.3 确认 LangChain JS 当前 DeepSeek 接入方式，明确使用官方 DeepSeek provider、OpenAI-compatible ChatModel 还是项目自定义 LangChain ChatModel adapter，并记录选择理由。
- [x] 1.4 确认 DeepSeek native Tool Calling 在目标 model 上支持 `tools`、`tool_calls`、tool arguments、tool call id 和错误返回格式；补最小 provider contract 测试或 fixture。
- [x] 1.5 列出旧 `agent-core` / `agent-planners` 中可复用的纯领域逻辑和必须删除的旧 runtime / action / registry / renderer / trace 逻辑。

## 2. 依赖和集中配置

- [x] 2.1 添加 LangChain 相关 npm 依赖，并确认 package lock / pnpm lock 与项目包管理器一致。
- [x] 2.2 在 `lib/server/config/` 新增或更新 LangChain Agent / DeepSeek Tool Calling 集中配置，覆盖 model、endpoint、temperature、max tokens、timeout、tool call budget、agent iteration budget、tool timeout 和 trace 裁剪。
- [x] 2.3 为所有新增或修改的导出配置对象、核心配置项和构造函数添加简短中文意图注释。
- [x] 2.4 更新配置测试，证明 `/api/chat`、LangChain model factory、tool wrapper 和 trace 投影从集中配置读取默认值，而不是局部硬编码运行参数。

## 3. LangChain Agent Runtime

- [x] 3.1 新增生产 LangChain Agent Runtime service，封装 model factory、prompt builder、tool catalog、run budget、AbortSignal 和错误归一化。
- [x] 3.2 实现 DeepSeek native Tool Calling 接入，确保模型请求暴露 LangChain tools / provider `tools`，并能读取 provider `tool_calls` 诊断摘要。
- [x] 3.3 实现 LangChain runtime 的失败归一化，区分配置缺失、provider HTTP / auth / quota / timeout、tool schema 拒绝、tool handler 失败、结构化输出校验失败和 response adapter 失败。
- [x] 3.4 为 LangChain runtime 增加单元测试，覆盖普通文本终态、一次 tool call 后回答、多次 tool call、未知 tool、非法 arguments、provider 失败和预算耗尽。
- [x] 3.5 确认 runtime 不依赖旧 `AgentAction`、旧 `PlannerPort`、旧 `ToolRegistry`、旧 `runAgentRuntime()` 或旧 Response Renderer。

## 4. LangChain Tool Wrapper 迁移

- [x] 4.1 设计通用 LangChain tool wrapper helper，统一处理 name、中文 description、schema、handler context、`userId` 注入、AbortSignal、timeout、错误 code、model-visible summary、user projection 和 trace summary。
- [x] 4.2 将当前生产只读业务 tool 迁移为 LangChain tools，至少覆盖 `searchExerciseResources`、`resolveExerciseResourceMentions`、`inspectVisibleTrainingProposals` 或实现阶段确认的当前 production tool catalog。
- [x] 4.3 为每个迁移 tool 完成抽象层级检查：说明稳定 resource type、能力族、同类变体、命名理由，以及 filter / sort / limit / cursor / resource reference 的边界。
- [x] 4.4 确认每个 tool wrapper 的描述性自然语言默认使用中文，`toolName`、字段名、枚举值、resource type 和 provider 字段保持英文。
- [x] 4.5 为每个迁移 tool 增加或更新 tool-level tests，直接覆盖 wrapper 成功路径、schema 拒绝、权限隔离、领域边界、失败归一化、model-visible summary、user projection、trace summary 和 AITest 真实健身场景。
- [x] 4.6 如迁移或新增写入 / 高风险 tool，补 policy / confirmation / idempotency 测试，并证明模型或 LangChain 不能自行生成可信 confirmation。

## 5. Prompt 和模型可见合同

- [x] 5.1 新增 LangChain agent prompt builder，使用中文说明 AI 健身助手角色、非医疗边界、native tool calling 规则、服务端校验边界、结构化输出要求和能力边界。
- [x] 5.2 删除或停用旧 AgentAction prompt 中要求模型输出 `{ type: "tool_call" | "final_answer" | "ask_user" }` 的生产入口。
- [x] 5.3 对照 `docs/llm-prompt-guidance.md` 检查 prompt / tool description / schema description / tool result summary 的分层：Prompt 定策略，Schema 定形状，Tool 定能力，Runtime 给事实，Validator 守边界。
- [x] 5.4 增加模型可见合同测试或快照，证明 prompt 不包含旧 `AgentAction`、旧 `ToolRegistry`、旧 `PlannerPort`、固定业务 phrasing 触发规则或服务端关键词分流规则。

## 6. 终态输出、结构化校验和响应投影

- [x] 6.1 实现 production response adapter，将 LangChain final message、tool wrapper summary、结构化 validator 结果和错误归一化结果投影为 NDJSON 白名单事件。
- [x] 6.2 保持 `/api/chat` 外部 NDJSON 用户可见合同，至少覆盖 `content`、`assistant_suggestions`、visible output、`error` 和 `done` 的安全投影。
- [x] 6.3 设计并实现结构化训练输出收口方式，明确使用 LangChain structured output、专用 finalization tool 或受控 terminal parser，并说明选择理由。
- [x] 6.4 确认训练方案、动作推荐、routine、plan 或等价结构化输出必须通过服务端 validator，`exerciseId` 必须经过数据库事实校验，未通过校验不得渲染、保存或写入训练事实。
- [x] 6.5 增加 response adapter tests，覆盖普通文本、澄清、建议回复、结构化输出、validator 失败、provider 失败和 tool wrapper 失败。

## 7. `/api/chat` 生产切换

- [x] 7.1 将 `/api/chat` 生产主链从旧 `createAgentTextChatResponse()` / `runAgentRuntime()` 切到 LangChain Agent Runtime，保留认证、请求校验、conversation hydration、幂等 user turn 处理和 response message id。
- [x] 7.2 删除 `/api/chat` 中旧 Agent core、旧 planner、旧 registry、旧 renderer、旧 terminal failure finalizer 与旧 runtime 的直接调用。
- [x] 7.3 确认 `/api/chat` 不新增基于用户原文关键词、正则、同义词表、短句模板或业务 phrasing 的 tool 选择分支。
- [x] 7.4 更新 `/api/chat` 自动化测试，覆盖成功回答、tool calling、澄清、配置缺失、provider 失败、tool schema 拒绝、结构化输出校验失败、NDJSON 事件和 trace 记录。

## 8. Trace 和调试视图迁移

- [x] 8.1 实现 LangChain run trace 投影，记录 run metadata、model request / response 摘要、DeepSeek `tool_calls`、tool wrapper 执行、结构化 validator 和 final NDJSON projection。
- [x] 8.2 确认 trace 写入是非致命诊断，trace 失败不得重试模型、重复执行 tool 或改变用户可见响应。
- [ ] 8.3 更新 dev trace view model 和相关测试，展示 LangChain runtime、DeepSeek native tool calls、tool wrapper results、结构化输出校验和旧 core 缺席证据。
- [ ] 8.4 删除或重写旧 trace 字段依赖，至少覆盖旧 `planner_action`、旧 `AgentAction`、旧 `duplicate_tool_call`、旧 resource refs、旧 `PlannerModelTraceEvent` 和旧 Response Renderer step。

## 9. 删除旧 Agent Core 和旧测试资产

- [ ] 9.1 删除旧 `lib/server/agent-core/**`、`lib/server/agent-planners/**`、旧 `AgentAction` schema / validator / repair loop、旧 ToolRegistry、旧 Executor、旧 ResourceStore 主链、旧 Response Renderer 主链和旧 ReplayPlanner。
- [ ] 9.2 删除或迁移旧 `tests/agent-core/**`、旧 `tests/agent-tools/**`、旧 chat-service 中只断言旧 AgentAction / ToolRegistry / runAgentRuntime 的测试。
- [ ] 9.3 审核旧 tool 文件中的领域逻辑，能复用的先抽到领域 service 或 repository，不能复用的旧 wrapper 直接删除。
- [ ] 9.4 更新 manual LLM 黑盒 runner，使其贴近真实 `/api/chat` + LangChain runtime；删除依赖旧 AgentAction / PlannerPort / ToolRegistry 的 fixture 和报告字段。
- [ ] 9.5 增加架构扫描，证明生产代码不再导入旧 `agent-core`、旧 `agent-planners`、旧 `AgentAction`、旧 `PlannerPort`、旧 `ToolRegistry`、旧 `runAgentRuntime()`、旧 `DeepSeekModelAdapter` 或旧 Response Renderer。

## 10. 文档和 OpenSpec 收口

- [x] 10.1 更新 `docs/architecture.md`、`docs/agent-tool-orchestrator-design.md` 和 `docs/llm-prompt-guidance.md` 中与旧 AgentAction / PlannerPort / ToolRegistry / DeepSeek JSON 输出模式不一致的当前架构说明。
- [x] 10.2 在 `docs/方案变更历史/` 新增本次架构变更记录，使用上海时间精确到秒，说明旧方案问题、LangChain 迁移思路、关键改动和验证方式。
- [x] 10.3 在 `docs/项目演变历程.md` 末尾追加本次核心链路迁移摘要，说明为了解决什么问题、做了什么架构调整。
- [x] 10.4 更新 OpenSpec 相关 specs 或归档说明，避免旧 `agent-core-removal`、旧 `agent-tool-contract-kernel` 与新 LangChain runtime 要求互相矛盾。

## 11. 验证

- [x] 11.1 运行 `openspec validate replace-agent-core-with-langchain-deepseek-tools --strict`。
- [x] 11.2 运行 LangChain runtime、tool wrapper、response adapter、trace projection、architecture boundary 和 `/api/chat` 相关自动化测试。
- [x] 11.3 运行 `npm run typecheck`。
- [x] 11.4 运行 `npm test` 或实现阶段确认的相关最窄测试集合；如因耗时或环境无法全量运行，必须说明未运行范围和剩余风险。
- [x] 11.5 如改动影响构建、路由、依赖配置或服务端/客户端模块边界，运行 `npm run build` 或说明无法运行原因。
- [x] 11.6 使用 `rg` 检查旧核心标识残留，至少覆盖 `AgentAction`、`PlannerPort`、`ToolRegistry`、`runAgentRuntime`、`LlmPlanner`、`DeepSeekModelAdapter`、`planner_action`、`duplicate_tool_call`、`AgentRunResult`。
- [x] 11.7 检查 `git diff --name-status`，如出现删除或重命名，确认都属于本 change 明确范围；删除旧 tests、scripts、docs 或 OpenSpec 文件前按高风险删除规则单独说明并获得确认。
