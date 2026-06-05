## Why

当前聊天活动条的用户可见文案由前端 `agentActivityDisplayByStage` 白名单保护，这是合理的；但生产聊天接入层仍维护了一个具体 `toolName -> AgentProgressStage` 映射。新增或重命名生产 tool 时，如果忘记同步该映射，活动条阶段就可能退回泛化文案，导致用户看到的进度和真实 tool 能力不同步。

本 change 让生产 tool 在自己的服务端内部 definition 字段中声明用户可见活动阶段，`/api/chat` 只读取该字段并投影为 `agent_progress.stage`，从源头减少跨文件同步遗漏。

## What Changes

- 将生产 tool 的用户可见活动阶段声明迁移到 tool definition 的 `uiActivityStage`，该字段不进入 Planner 可见 manifest。
- 移除 production chat service 中具体业务 `toolName -> stage` 的集中映射，保留基于 tool definition 字段和稳定 resource contract 的通用 fallback。
- 保留前端 `agentActivityDisplayByStage` 作为 stage 到中文短文案的用户安全白名单，不让 toolName、trace event 或内部字段直接进入用户 UI。
- 增加测试约束：生产 tool 如需要具体活动阶段，必须在 tool definition 中声明；chat service 不得重新出现具体业务 `toolName` 活动映射。
- 不新增业务 tool，不改变 tool handler、Planner 决策、tool input/output、resource contract、Policy Guard、Response Renderer 或最终回复语义。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `chat-agent-activity-indicator`: 明确 Agent 活动阶段应优先来自 tool 安全 definition 字段，前端继续只消费粗粒度 stage 并展示中文白名单文案。
- `agent-text-chat-flow`: 收紧 production chat service 的 `agent_progress` 投影边界，禁止在聊天接入层维护具体业务 `toolName` 活动阶段表。

## Impact

- OpenSpec: `openspec/changes/sync-agent-activity-tool-metadata/`。
- Tool 定义: `searchExerciseResources`、`resolveExerciseResourceMentions`、`inspectVisibleTrainingProposals` 的 `uiActivityStage`。
- Production chat: `lib/server/chat/agent-text-chat-service.ts` 的 progress stage 映射。
- 测试: chat service stream、architecture boundary、tool activity stage 同步约束、TypeScript 类型检查。
- 文档: `docs/方案变更历史/` 和 `docs/项目演变历程.md` 记录活动阶段同步边界。
