## Why

当前聊天页活动条只能展示服务端根据固定 `AgentProgressStage` 映射出的中文文案，用户看到的是粗粒度后端状态，而不是模型在本轮 Agent loop 中计划推进的用户目标。需要让 LLM 在受控 `AgentAction` 合同中提供一句用户安全的短活动摘要，使前端能展示“这一轮想做什么”，同时继续保持服务端只做结构校验、安全投影和临时 UI 状态管理。

## What Changes

- 在 `AgentAction` 中新增可选 `activitySummary` 字段，用于表达本轮 action 的用户可见活动摘要。
- 更新默认 Agent LLM prompt / action contract，使模型知道 `activitySummary` 是短中文 UI 文案，不是推理内容、最终回答、tool input 或业务判断依据。
- 扩展 runtime trace 和 `/api/chat` NDJSON 进度投影，使服务端只在 action 校验通过且摘要安全时，把该摘要作为当前请求内临时 `agent_progress` 文案发给前端。
- 更新前端聊天 stream parser、活动条状态模型和展示仲裁，使 `activitySummary` 优先于固定 stage 文案展示；摘要缺失、非法或不安全时继续使用现有 stage fallback。
- 保持活动摘要不进入 `ChatMessage`、聊天历史、conversation summary、conversation context、visible output、artifact payload 或模型后续上下文。
- 不复用 `reasoning_content`，不展示模型原始推理，不让 LLM 直接生成 NDJSON event。
- 不新增服务端关键词、正则、同义词表、短句模板、业务 `toolName` 特判或基于用户原文的语义分流。

## Capabilities

### New Capabilities

- 无。该 change 在现有 AgentAction、文本聊天 stream 和聊天活动条能力上增加受控用户态摘要，不新增独立业务能力。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 修改 `AgentAction` 模型可见合同，新增 `activitySummary` 字段及其用户安全边界。
- `agent-text-chat-flow`: 修改 `/api/chat` 文本聊天 NDJSON 进度事件合同，允许服务端从已校验 action 投影安全活动摘要。
- `chat-agent-activity-indicator`: 修改聊天活动条展示合同，使活动条可展示已校验的模型短摘要并保持 fallback。
- `chat-agent-activity-display-stability`: 修改活动条展示仲裁规则，使动态摘要与 loop 轮次、stage fallback 和生命周期清理保持独立。

## Impact

- 影响服务端：`lib/server/agent-core/contracts.ts`、Action Validator / repair feedback、runtime trace event、`lib/server/config/agent-llm-prompt-config.ts`、`lib/server/chat/agent-text-chat-service.ts`。
- 影响前端：`features/chat/types.ts`、`features/chat/api/chat-client.ts`、`features/chat/lib/agent-activity.ts`、`features/chat/components/agent-activity-indicator.tsx`、`features/chat/hooks/use-chat-controller.ts`。
- 影响测试：AgentAction schema / prompt config tests、runtime trace tests、chat service stream tests、frontend NDJSON parser tests、activity reducer / component tests、history persistence tests。
- 不影响数据库、Prisma schema、持久化结构、训练计划生成规则、业务 tool handler、权限模型或外部 API。
