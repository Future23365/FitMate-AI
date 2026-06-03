# Agent 文本聊天 Unsupported 错误投影

时间：2026-06-03 17:14:00 CST

## 原问题

生产 `/api/chat` 已接入新 `agent-core` 文本聊天闭环，但当前阶段仍刻意使用空 `ToolRegistry`。当模型面对“生成训练计划”这类尚未接入的能力时，可能返回 `tool_call`；runtime 随后会因 unknown tool 或 repair limit 失败收口。旧投影会把 `terminalError.message` 变成 NDJSON `error.message`，前端再把它写入 assistant 气泡，导致用户看到 `Agent runtime reached the invalid action repair limit.` 这类内部英文错误。

这个问题不是要接入真实业务 tool，也不是要让服务端从用户文本里判断“生成计划”。根因在用户可见错误投影边界：内部 runtime 诊断和前端可见助手文案没有分离。

## 调整思路

本次保持 production text chat 的空 registry 边界，只基于确定性事实做投影：

- 根据 registry 为空、planner action type、Action Validator / runtime error code、trace event 和 repair reason 识别当前能力不支持。
- unsupported capability 输出普通 `content`、`assistant_suggestions` 和 `done`，不输出会被前端显示的内部错误 message。
- 通用 Response Renderer 对 terminal error 只输出稳定中文 safe error message，同时保留 code、retryable 和脱敏 details。
- 前端 `chat-client` 和 `use-chat-controller` 永远不直接展示 `event.error.message`、HTTP body、provider 原文、stream parser message 或 `Error.message`。

## 关键改动

- `lib/server/chat/agent-text-chat-service.ts` 新增 production text chat unsupported fallback 投影。
- `lib/server/agent-core/response-renderer.ts` 将默认 terminal error message 收敛为安全中文文案。
- `features/chat/api/chat-client.ts` 将 HTTP、NDJSON error、stream error 和普通 Error 映射为本地安全文案。
- 更新后端、前端和架构扫描测试，证明没有注册真实业务 tool、fixture registry、旧事件或关键词分流。

## 验证结果

- `openspec validate stabilize-agent-text-chat-unsupported-response --strict` 通过。
- `npm test -- tests/chat-service.test.ts tests/client-api.test.ts tests/chat-controller-stream-state.test.ts tests/agent-core/executor-runtime-renderer.test.ts tests/agent-core/architecture-boundary.test.ts` 通过，5 个测试文件、30 个测试通过。
- `npm run typecheck` 通过。
