## Why

当前 `/api/chat` 已经切到新 `agent-core` 文本聊天主链，但该链路没有调用 `AiTrace` 写入入口，导致 `/dev/ai-traces` 看不到最新聊天请求。日志页仍存在，`agent-core` 也会产出 `traceEvents`，但二者之间缺少稳定的 production trace 投影。

现在需要先补一个明确的 OpenSpec change，重新定义“文本聊天接入阶段”的 trace 生产协议，避免直接把旧 Agent trace view model、旧 `AgentExecutionResult` 或业务 tool 事件恢复回来。

## What Changes

- 为 production `/api/chat` 文本聊天主链补齐开发态 `AiTrace` 生产：合法请求进入 `createAgentTextChatResponse()` 后，应创建与当前用户绑定的 trace。
- 将 `AgentRunInput`、`AgentRunResult.traceEvents`、runtime 状态、最终用户可见 NDJSON 投影摘要转写为脱敏、可复盘的 `AiTrace` steps。
- 让 `/dev/ai-traces` 能展示当前文本聊天 trace，并继续保留历史 trace / Raw JSON 查看能力。
- 保留当前阶段的空 `ToolRegistry` 边界，不新增动作库、训练生成、artifact 保存、用户记忆或任何业务 tool。
- 不恢复旧 `agent-orchestrator`、旧 `assistant_action`、旧 `intent_resolved`、旧 `AgentExecutionResult` 或旧 Agent timeline view model。
- 不新增持久化 trace 表；本 change 只恢复现有开发态内存 trace store 的生产写入。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ai-run-trace`: 明确新 `agent-core` 文本聊天主链必须把 `AgentRunResult.traceEvents` 和最终响应摘要写入 `AiTrace`，并遵守脱敏、截断和用户隔离边界。
- `ai-trace-debugger`: 明确 `/dev/ai-traces` 必须能列出并展示当前文本聊天 trace；没有业务 tool 时仍应展示 run、模型决策、校验、最终响应和错误边界。
- `agent-text-chat-flow`: 明确 production 文本聊天成功、澄清、配置错误和 runtime 失败都必须留下可诊断 trace，同时仍不注册业务 tool 或旧兼容事件。

## Impact

- 可能影响代码：`lib/server/chat/agent-text-chat-service.ts`、`app/api/chat/route.ts`、`lib/server/dev/ai-trace-logger.ts`、`lib/server/dev/ai-trace-store.ts`、`components/dev/ai-trace-viewer.tsx`。
- 可能影响测试：`tests/chat-service.test.ts`、`tests/api-routes.test.ts`、`tests/ai-trace-http.test.ts`、`tests/ai-trace-viewer.test.ts`、`tests/agent-core/architecture-boundary.test.ts`。
- 不影响 Prisma Schema、数据库迁移、真实业务 tool 注册、前端聊天用户可见事件协议或训练领域规则。
