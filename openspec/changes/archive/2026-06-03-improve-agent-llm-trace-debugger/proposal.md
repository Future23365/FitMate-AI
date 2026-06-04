## Why

当前 `/api/chat` 文本聊天 trace 只记录 `AgentRunInput`、runtime `traceEvents` 和最终 NDJSON 摘要，没有记录实际传给 LLM 的请求、模型原始响应、解析出的 action candidate 以及 token usage。开发者在 `/dev/ai-traces` 中看不到 LLM 对话如何进行，也无法按架构模块判断问题发生在请求 hydration、Planner/ModelAdapter、Action Validator、Runtime、Response Renderer 还是 trace 导出。

## What Changes

- 为新 `agent-core` 文本聊天补齐 Planner / ModelAdapter 观测：记录每次模型调用的安全请求摘要、模型响应摘要、parsed action、解析/校验错误、token usage 和估算 token。
- 按 `docs/agent-tool-orchestrator-design.md` 的职责边界，把 `/dev/ai-traces` 从按低层 step type 粗分改为按模块展示：入口与上下文、ToolRegistry/Manifest、Planner/ModelAdapter、Runtime/Validator/Policy/Resource、Response Renderer、错误与导出。
- 页面默认只展示排查问题最有用的信息；完整但脱敏的请求/响应、raw model text、token usage、trace event 和 Raw JSON 保留在保存全链路 log 中。
- 保持安全边界：不保存 API key、authorization、cookie、完整敏感 payload、完整 tool output、跨用户 payload；不新增业务 tool，不恢复旧 Agent 事件，不在 `/api/chat` 增加自然语言关键词分流。
- 增加 trace、planner/model instrumentation、调试页分组、导出内容和架构边界测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ai-run-trace`: 新 `agent-core` 文本聊天 trace 必须包含 Planner / ModelAdapter 调用摘要、模型输入输出摘要、parsed action、token usage 和估算 token，并保持脱敏与截断。
- `ai-trace-debugger`: `/dev/ai-traces` 必须按架构模块展示当前文本聊天 trace，只展示有助于定位问题的信息，同时保存全链路 log 能包含更完整的脱敏诊断数据。
- `agent-text-chat-flow`: production 文本聊天接入必须把 Planner / ModelAdapter 观测接入当前用户 trace，不改变 NDJSON 用户响应、不注册业务 tool、不恢复旧兼容事件。

## Impact

- 可能影响代码：`lib/server/agent-planners/llm-planner.ts`、`lib/server/agent-planners/model-adapters/model-adapter.ts`、`lib/server/agent-planners/model-adapters/deepseek-model-adapter.ts`、`lib/server/chat/agent-text-chat-service.ts`、`lib/server/dev/ai-trace-store.ts`、`components/dev/ai-trace-viewer.tsx`。
- 可能影响测试：`tests/agent-core/adapter-llm-planner.test.ts`、`tests/chat-service.test.ts`、`tests/api-routes.test.ts`、`tests/ai-trace-http.test.ts`、`tests/ai-trace-viewer.test.ts`、`tests/agent-core/architecture-boundary.test.ts`。
- 可能影响文档：`docs/agent-tool-orchestrator-design.md`、`docs/方案变更历史/`、`docs/项目演变历程.md`。
- 不影响 Prisma Schema、数据库迁移、真实业务 tool 注册、训练计划生成规则、前端聊天用户可见 NDJSON 协议或权限模型。
