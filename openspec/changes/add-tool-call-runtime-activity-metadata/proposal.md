## Why

当前聊天活动条把模型活动汇报建模为独立 `reportAgentActivity` tool，导致 UI 状态被升级成 Agent 动作：模型可能单独调用该 tool 造成空转 loop，也可能在业务 tool loop 中缺少新的活动摘要，使前端重复滚动上一条文案。需要把活动摘要收敛为业务 tool call 的 request-local runtime metadata，让进度展示跟随真实业务工具执行，同时不污染业务事实、grounding 或工具输出。

## What Changes

- 新增统一的业务 tool call runtime metadata envelope，允许模型在业务 tool input 中传入 `runtimeMetadata.activitySummary`。
- LangChain tool wrapper 在执行 handler 前统一消费、校验和投影 `runtimeMetadata.activitySummary`，并将 `runtimeMetadata` 从业务 input 中剥离。
- 废弃独立 `reportAgentActivity` 作为长期活动展示入口；生产 catalog 不再依赖 activity-only tool 来生成聊天活动条文案。
- 模型可见 tool schema / prompt 说明需要表达 `runtimeMetadata.activitySummary` 是当前请求 UI 进度摘要，不是业务事实、调用理由审计、工具输出或 grounding 来源。
- `/api/chat` 继续输出 `agent_progress` NDJSON 事件，前端继续消费 `activitySummary`，但前端不得因为只有 `agent_loop` 轮次变化而重复滚动上一条相同文案。
- trace 将 activity metadata 记录为 runtime / UI metadata，不混入业务 tool `toTraceSummary`、model-visible summary、user projection 或 visible output。
- **BREAKING**: `reportAgentActivity` 不再作为生产 Agent 活动摘要的推荐合同；依赖独立 activity tool 的 prompt、预算和测试需要迁移到 runtime metadata 合同。

## Capabilities

### New Capabilities

- `agent-tool-call-runtime-metadata`: 定义所有生产业务 LangChain tool 统一支持的 request-local runtime metadata envelope、`activitySummary` 输入边界、wrapper 消费与投影规则、trace 隔离和测试要求。

### Modified Capabilities

- `langchain-agent-runtime`: 将模型活动汇报从独立 `reportAgentActivity` tool 迁移到业务 tool call runtime metadata，并调整 runtime / catalog / stream observer / 预算边界。
- `agent-llm-prompt-configuration`: 将模型可见运行规则从独立 activity report 预算迁移到 `runtimeMetadata.activitySummary` 字段说明，避免鼓励 activity-only tool call。
- `agent-text-chat-flow`: 明确 `/api/chat` 的 `agent_progress.activitySummary` 来源可以是已校验 runtime metadata，但 `agent_loop`、`stage`、`status` 和 `sequence` 仍来自服务端生命周期。
- `chat-agent-activity-display-stability`: 调整聊天活动条展示仲裁，确保只有新活动摘要或真实 stage 文案变化才触发文案滚动；单独的 `agent_loop` 轮次变化不得重复滚动上一条相同摘要。

## Impact

- 影响服务端 Agent tool wrapper、production tool catalog、LangChain runtime observer、`/api/chat` NDJSON activity projection、trace projection 和相关配置。
- 影响传给模型的 system prompt、LangChain tool schema description / description、tool catalog contract tests 和 model-visible contract gate。
- 影响前端聊天活动条 reducer / indicator 的重复文案动画策略，但不改变聊天历史、visible output、训练事实或业务 tool handler 输出。
- 需要新增或更新 OpenSpec specs、runtime / tool wrapper 单测、API stream 单测、前端 activity 单测，并运行 `openspec validate <change> --strict`、相关 `npm test` 和 `npm run typecheck`。
