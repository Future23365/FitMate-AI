# LangChain 模型活动摘要流恢复

时间：2026-06-11 17:32:33 CST

## 原方案为什么不合适

生产聊天迁移到 LangChain DeepSeek native `tool_calls` 后，前端活动条虽然还保留 `agent_loop`、`agent_progress` 和 `activitySummary` 的消费能力，但服务端只发送 `preparing_context`、`analyzing_request`、`writing_reply` 这类粗粒度状态。

这无法表达模型每一步真实准备做什么。继续由服务端按业务 tool 固定映射文案，会把 UI 状态变成后端模板，不符合“展示大模型每一步在干什么”的产品目标。

## 调整思路

新增 `reportAgentActivity` LangChain tool，让模型在进入新的理解、查询、校验、整理或收口步骤前，主动用 `summary` 汇报当前步骤摘要。

服务端只负责：

- 校验输入是字符串。
- 宽松归一化摘要，去掉控制字符和多余空白，过长时裁剪。
- 通过 runtime observer 将摘要实时投影为 `agent_progress.activitySummary`。
- 保持摘要为当前请求内 UI 状态，不进入聊天历史、conversation summary、visible output、训练事实或最终回答 grounding。

## 关键改动

- 新增 `lib/server/langchain-agent/tools/activity-tool.ts`，定义 `reportAgentActivity`。
- `production-tool-catalog` 默认注册 `reportAgentActivity`，但不根据用户原文动态启停。
- `runLangChainAgentRuntime()` 新增 request-local observer，输出 `model_call_started` 和 `model_activity_reported`。
- `/api/chat` streaming adapter 将 `model_call_started` 投影为 `agent_loop`，将 `model_activity_reported` 投影为 `agent_progress(stage = "model_activity")`。
- `reportAgentActivity` 标记为 `executionKind = "activity"`，不消耗业务 tool 调用预算，单独使用 `maxActivityReports` 防止状态刷屏。
- 前端新增 `model_activity` stage，并把 `activitySummary` 校验保持宽松：不要求固定中文模板，不因普通英文或非模板表达拒绝展示。

## 验证方式

- `openspec validate restore-langchain-agent-activity-stream --strict`
- `npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts tests/api-routes.test.ts tests/client-api.test.ts tests/chat-agent-activity.test.ts tests/chat-controller-stream-state.test.ts`
- `npm run typecheck`

## 当前保留风险

- 模型可能不主动调用 `reportAgentActivity`，此时前端只能显示初始加载态或已有 fallback。
- 活动摘要会增加少量 tool call 和上下文开销；当前通过短摘要、独立上限和不持久化控制影响。
- 服务端校验按用户要求保持宽松，因此不会强拦普通内部词；摘要仍只作为临时 UI 文案，不进入业务事实链。
