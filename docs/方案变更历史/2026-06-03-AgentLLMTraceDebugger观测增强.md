# Agent LLM Trace Debugger 观测增强

记录时间：2026-06-03 18:12:36 +0800

## 原问题

新 `agent-core` 文本聊天已经能在 `/dev/ai-traces` 中看到 `AgentRunInput`、空 `ToolRegistry`、runtime `traceEvents` 和 NDJSON 响应摘要，但看不到真正传给 LLM 的请求、模型原始响应摘要、解析出的 action candidate、解析失败边界和真实 token usage。遇到 `unknown_tool`、`invalid_json`、`invalid_action_schema` 或 repair limit 时，开发者只能看到 runtime 层失败，看不见 Planner / ModelAdapter 层发生了什么。

这不是单纯页面展示问题，而是 Planner / ModelAdapter 边界缺少可保存的安全观测合同。

## 调整思路

保持 `PlannerPort.decideNext()` 只返回 `AgentAction`，不把 diagnostics 写入 core 主合同。生产 `LlmPlanner` 在实例上保留可选模型调用诊断，`DeepSeekModelAdapter` 负责生成供应商无关的脱敏 request / response envelope，`/api/chat` 薄接入层再把这些诊断投影为开发态 `model_request` 和 `model_response` trace steps。

这样可以补齐排查证据，同时不让 `agent-core` 主循环、Validator、Executor、Policy Guard、ResourceStore 或 Response Renderer 感知具体模型协议。

## 关键改动

- `ModelActionCompletionResult` 新增可选 `trace` 诊断，包含 request config、messages 摘要、raw response 摘要、parsed action、parse status、failure code 和真实 token usage。
- `DeepSeekModelAdapter` 生成字段白名单、脱敏、截断后的模型调用 envelope，不记录 API key、authorization、cookie 或完整敏感 payload。
- `LlmPlanner` 记录 planner call index、runtime step、runId 和 action candidate 关联信息，但不修改 `PlannerPort` 返回合同。
- `agent-text-chat-service` 读取可诊断 planner，写入 `model_request` / `model_response`，并把真实 usage 汇总到 trace metadata，与 runtime `estimated_tokens` 预算估算分开。
- `/dev/ai-traces` 改为按入口与上下文、ToolRegistry/Manifest、Planner/ModelAdapter、Runtime/Validator、Policy/Resource、Response Renderer、错误诊断和 Raw/导出模块展示。
- 保存全链路 log 新增 `moduleGroups`、`plannerModelCalls`、`tokenUsageSummary`、`runtimeTraceEvents`、`responseSummary` 和 `rawTrace`，用户问答记录仍保持窄字段。

## 验证结果

- `npm test -- tests/agent-core/adapter-llm-planner.test.ts tests/chat-service.test.ts tests/api-routes.test.ts tests/ai-trace-http.test.ts tests/ai-trace-viewer.test.ts`

以上测试覆盖 DeepSeek 诊断、usage 归一化、invalid JSON / invalid action schema、敏感字段脱敏、聊天 trace 写入、HTTP 保存 payload 和模块化 viewer 分组。
