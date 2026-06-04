# 2026-06-03 17:26:56 CST Agent 文本聊天 Trace 接入

## 原问题

`/api/chat` 已经重新接入新 `agent-core` 文本聊天闭环，但生产聊天请求没有写入开发态 `AiTrace`。结果是 `/dev/ai-traces` 看不到最新首页聊天请求，配置错误、runtime 校验失败、空 registry 下的 tool call 收口和最终 NDJSON 响应缺少同一条可复盘证据。

## 调整思路

trace 生命周期放在聊天薄接入层，而不是放进 `agent-core`。`agent-core` 继续只负责通用 runtime、planner 合同、tool registry、校验、执行、策略和默认 renderer；聊天接入服务把已经存在的 `AgentRunInput`、`AgentRunResult.traceEvents` 和真实返回的 NDJSON 事件做白名单摘要后写入 `AiTrace`。

## 关键改动

- 在 `createAgentTextChatResponse()` 内创建当前用户绑定的 `/api/chat` trace，记录 runId、conversationId、responseMessageId、最新用户消息摘要、hydration 摘要和空 `ToolRegistry`。
- 成功路径把 `registry_snapshot`、`budget_event`、`planner_action`、`validation_result`、`terminal_grounding`、`policy_decision`、`resource_registered` 等 runtime event 投影为脱敏 trace step。
- 配置错误路径写入 `chat_ai_not_configured` failed trace；runtime 失败路径写入 terminal error code、runtime status 和最终响应摘要。
- trace 使用同一份即将返回给前端的 NDJSON 事件数组生成响应摘要，避免日志和真实响应分叉。
- `/dev/ai-traces` 增加 `runtime_event` 分组，保存完整 trace log 前继续做脱敏，保存用户问答记录继续保持窄字段。

## 验证

- `npm test -- tests/chat-service.test.ts tests/api-routes.test.ts tests/ai-trace-http.test.ts tests/ai-trace-viewer.test.ts`

