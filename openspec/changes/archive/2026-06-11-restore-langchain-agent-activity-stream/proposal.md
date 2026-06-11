## Why

生产 `/api/chat` 迁移到 LangChain native tool calling 后，聊天页活动条只剩服务端粗粒度 `agent_progress`，无法展示模型每一步真实准备做什么。用户需要看到模型在每个推理 / 查询 / 校验 / 整理步骤中的即时中文总结，而不是服务端按 tool 固定映射出的状态文案。

## What Changes

- 新增一个受控 LangChain activity tool，让模型在关键步骤前用短中文 `summary` 主动报告当前步骤意图。
- `/api/chat` 将通过校验的模型活动摘要实时投影为现有 `agent_progress.activitySummary` NDJSON 事件。
- 服务端只做宽松结构校验、长度裁剪和当前请求内转发，不生成固定业务文案、不根据用户原文或业务 `toolName` 替模型总结步骤。
- 活动摘要不参与 tool 选择、权限、grounding、最终回答、结构化输出、聊天历史、conversation summary、visible output 或训练事实持久化。
- 保留独立 `agent_loop` 轮次事件；`agent_progress` 只表达模型生成的当前活动文案。

## Capabilities

### New Capabilities

<!-- 本次不新增独立能力，改动落在现有 LangChain runtime 与聊天活动条能力上。 -->

### Modified Capabilities

- `langchain-agent-runtime`: 增加模型活动汇报 tool、runtime observer、生产 tool catalog 接入和 NDJSON 投影边界。
- `chat-agent-activity-indicator`: 活动条优先展示模型生成的 `activitySummary`，并保持当前请求内临时状态。
- `chat-agent-activity-display-stability`: 活动摘要展示仲裁继续保持与 `agent_loop` 轮次独立，并使用宽松校验策略避免误伤模型自然语言总结。

## Impact

- 影响 `lib/server/langchain-agent/**` 的 tool catalog、runtime、prompt 和类型合同。
- 影响 `lib/server/chat/langchain-agent-text-chat-service.ts` 的 streaming NDJSON 投影。
- 影响 `features/chat/**` 的 activity stage / summary 解析与展示白名单。
- 影响 LangChain runtime、production tool catalog、API route、client parser、activity reducer 和 prompt 合同相关测试。
