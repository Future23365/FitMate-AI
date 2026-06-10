## Why

当前生产 Agent 已经围绕自研 `agent-core`、`AgentAction`、`PlannerPort`、`ToolRegistry`、`DeepSeekModelAdapter` JSON 输出协议和 Response Renderer 形成一套高维护成本的自定义执行循环。继续在这套循环上只替换 adapter，会保留旧抽象的复杂度，也无法真正利用 DeepSeek native Tool Calling 和 LangChain agent harness。

本 change 目标是一次性把生产 Agent 主链迁移为 LangChain Agent + DeepSeek native `tool_calls`，并在迁移完成后删除旧自研 Agent core。迁移后模型负责自然语言理解和 tool calling 决策，LangChain 负责 agent harness，项目服务端继续负责权限、Zod 校验、数据库事实校验、训练输出校验、trace、NDJSON 投影和持久化边界。

## What Changes

- **BREAKING** 用 LangChain agent harness 替换当前生产 `runAgentRuntime()` / `LlmPlanner` / `DeepSeekModelAdapter` 自研 Agent 主链，生产 `/api/chat` 不再通过旧 `AgentAction` JSON 协议驱动 tool loop。
- **BREAKING** DeepSeek 模型调用改为 native Tool Calling 模式，模型通过 provider `tool_calls` 选择工具；系统不再要求模型手写 `{ type: "tool_call" | "final_answer" | "ask_user" }` 形态的自定义 action JSON。
- **BREAKING** 现有业务 Agent tools 改封装为 LangChain tools。tool wrapper 必须复用项目已有领域服务、权限隔离、输入输出 Zod 校验、事实投影、trace 摘要和错误归一化，不允许绕过服务端确定性边界。
- **BREAKING** 迁移完成后删除旧 `lib/server/agent-core/**`、旧 `lib/server/agent-planners/**`、旧 AgentAction validator、旧 ToolRegistry、旧 Executor、旧 ResourceStore / Resource Contract Validator 主链、旧 Response Renderer 主链、旧 replay planner 和只服务旧 core 的 tests / fixtures。
- **BREAKING** 终态回答和澄清不再作为旧 `AgentAction.final_answer` / `AgentAction.ask_user` 处理。新链路必须使用 LangChain 最终消息、结构化输出或受控终态投影，并由 production response adapter 转成现有前端可消费的 NDJSON 事件。
- 保留并迁移项目确定性边界：认证与 `userId` 隔离、请求校验、业务 tool 权限、动作数据库事实校验、`visibleTrainingProposal` 等结构化输出校验、成本/超时/步数预算、trace 脱敏、错误归一化和 `/api/chat` NDJSON 响应合同。
- 新增 LangChain tool 注册与生产 tool catalog，明确哪些业务能力可暴露给模型，禁止 fixture tools、隐藏服务和关键词路由进入生产聊天。
- 更新 Agent prompt / model-visible 合同：描述性自然语言继续默认使用中文，技术标识保持英文；tool 能力边界写入 LangChain tool description / schema description / examples 或等价模型可见说明，不再写入旧 AgentAction prompt。
- 更新 trace / dev log：记录 LangChain agent run、DeepSeek `tool_calls`、tool wrapper 输入输出摘要、tool result 可见性、结构化输出校验和最终 NDJSON 投影，不再记录旧 Agent loop 的 `planner_action` / `duplicate_tool_call` / old `AgentAction` 语义。
- 更新架构、Prompt、Agent tool governance 和测试边界文档，使后续新增业务能力默认通过 LangChain tool wrapper 扩展，而不是重新引入旧 `agent-core`。

## Capabilities

### New Capabilities

- `langchain-agent-runtime`: 定义生产 `/api/chat` 使用 LangChain agent harness、DeepSeek native Tool Calling、LangChain tool wrapper、终态投影、旧 Agent core 删除和验收边界。

### Modified Capabilities

- `agent-tool-contract-kernel`: 废止旧 `AgentAction` / `PlannerPort` / `ToolRegistry` / `Executor` / `Response Renderer` 作为生产 Agent core 的要求，并迁移为 LangChain tool wrapper 和确定性服务端边界要求。
- `agent-llm-prompt-configuration`: 将模型可见合同从旧 AgentAction JSON 输出协议迁移为 LangChain / DeepSeek native tool calling 语义，保留中文描述、工具边界、结构化输出和失败恢复原则。
- `agent-text-chat-flow`: 将 `/api/chat` 生产主链从 `runAgentRuntime()` 切换为 LangChain agent runtime，并保持认证、会话 hydration、NDJSON 响应和错误投影合同。
- `ai-run-trace`: 将 trace 观测从旧 Agent loop 事件迁移为 LangChain agent run、DeepSeek `tool_calls`、LangChain tool execution 和终态投影证据。
- `agent-runtime-configuration`: 将 LangChain agent、DeepSeek native tool calling、tool execution budget、trace 裁剪和 provider 默认参数纳入集中配置。
- `agent-tool-change-governance`: 更新后续 Agent tool 变更治理，要求新增/修改业务 tool 默认走 LangChain tool wrapper，而不是旧 `ToolRegistry` / `defineTool` / `AgentAction`。
- `agent-core-removal`: 调整旧 core 删除边界，删除对象从历史 `agent-orchestrator` 扩展到当前 `agent-core`、`agent-planners` 和旧自研 AgentAction 执行链。

## Impact

- 影响代码范围：`app/api/chat/**`、`lib/server/chat/agent-text-chat-service.ts`、`lib/server/agent-core/**`、`lib/server/agent-planners/**`、`lib/server/agent-tools/**`、`lib/server/config/**`、`lib/server/dev/ai-trace-store.ts`、业务 tool 所依赖的领域服务、相关 response / trace / validation helpers。
- 影响测试范围：旧 `tests/agent-core/**`、`tests/agent-tools/**`、`tests/chat-service.test.ts`、trace view model tests、manual LLM 黑盒 runner、architecture boundary tests。实现阶段需要新增 LangChain runtime、tool wrapper、DeepSeek native tool calls、终态投影和旧 core 缺席扫描测试。
- 影响依赖：新增 LangChain 相关 npm 依赖，并确认 DeepSeek provider 接入方式。依赖版本、provider adapter 和环境变量读取必须集中配置，不允许散落在 route 或业务 tool 中。
- 影响 API：`/api/chat` 对前端的外部请求和 NDJSON 响应合同应尽量保持稳定；内部 trace event、debug payload、旧 AgentAction、旧 tool result id、旧 resource contract 和旧 planner diagnostics 是 breaking internal contract。
- 不涉及数据库 schema 迁移，除非实现阶段发现 LangChain run 持久化或 trace 结构必须新增表字段；若发生，则必须在该 change 内补充 Prisma migration 和数据边界任务。
- 不启动浏览器验证。该 change 的验证优先使用 OpenSpec validate、typecheck、单元测试、架构扫描、`/api/chat` 自动化测试和必要 build。
