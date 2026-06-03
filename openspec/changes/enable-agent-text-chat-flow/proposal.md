## Why

M0/M1/M2 已完成通用 `agent-core`、资源/策略闭环和 DeepSeek planner 上线硬化，但生产 `/api/chat` 仍固定返回 `chat_ai_disabled`，首页聊天无法验证新架构的真实用户闭环。现在需要在不接入任何具体业务 tool 的前提下，先把文本聊天、澄清、建议回复和 NDJSON 流式消费跑通。

## What Changes

- 新增生产 `/api/chat` 文本聊天接入层，将请求校验、服务端 hydration 和当前用户身份转换为 `AgentRunInput`，并调用新 `agent-core` runtime。
- `/api/chat` 使用空 `ToolRegistry` 和 `LlmPlanner + DeepSeekModelAdapter`，只验证 `final_answer`、`ask_user`、非法 `tool_call` 拒绝、runtime 预算和默认 Response Renderer。
- 前端聊天请求从禁用 JSON 响应恢复为 NDJSON 流式消费，先只处理 `content`、`assistant_suggestions`、`error`、`done` 等通用事件。
- 明确本 change 不注册 fixture tool，不接入 `searchExercises`、训练生成、保存、用户记忆、数据库业务查询或任何 `agent-tools/<domain>` 业务 tool。
- 明确不恢复旧 `lib/server/agent-orchestrator/**`、旧 `AgentExecutionResult`、旧 Response Writer、旧 `assistant_action`、旧 intent-first prompt 或旧兼容事件。
- 新增生产接入相关自动化测试和架构扫描，证明 `/api/chat` 没有业务关键词分流、没有注册真实业务 tool，也没有把 fixture runtime 当成生产能力。

## Capabilities

### New Capabilities

- `agent-text-chat-flow`: 定义生产 `/api/chat` 使用新 `agent-core` 跑通无业务 tool 文本聊天的能力，包括 `AgentRunInput` 构造、空 registry、DeepSeek planner、默认 NDJSON renderer、前端流式消费、错误收口和测试边界。

### Modified Capabilities

- 无。本 change 新增生产文本聊天接入能力，不修改既有动作库、训练生成、保存、用户记忆、旧 Agent 删除边界或具体业务 tool 能力。

## Impact

- 影响后端：`app/api/chat/route.ts`、`lib/server/chat/chat-service.ts` 或新增的聊天 Agent 接入服务、`lib/server/agent-core/**` 的既有导出使用边界、`lib/server/agent-planners/**` 的生产构造入口。
- 影响前端：`features/chat/api/chat-client.ts`、`features/chat/hooks/use-chat-controller.ts` 的请求与 NDJSON 消费逻辑；不新增卡片类业务事件。
- 影响测试：新增或更新 `/api/chat` route、chat service、chat client、前端 hook 和架构扫描测试；按需覆盖 fake planner / fake adapter、DeepSeek adapter 构造缺省、空 registry 拒绝 `tool_call`。
- 影响文档：更新 `docs/agent-tool-orchestrator-design.md`，记录 production text chat flow 已从 M2 之后单独接入；如实施涉及核心链路调整，同步追加 `docs/方案变更历史` 和 `docs/项目演变历程.md`。
- 不影响数据库结构、Prisma Schema、训练计划生成规则、动作检索规则、artifact 保存结构、权限模型、真实业务 tool 注册或 dev server 启动方式。
