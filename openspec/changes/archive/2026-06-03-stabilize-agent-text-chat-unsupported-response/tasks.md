## 1. 前置复核

- [x] 1.1 读取 `codex_logs/ai_trace_log.js`，记录当前失败链路中的 runtime / tool / response 投影证据，区分历史完整 tool trace 和当前生产文本聊天空 registry 路径。
- [x] 1.2 复核 `app/api/chat/route.ts`、`lib/server/chat/agent-text-chat-service.ts`、`lib/server/agent-core/runtime.ts`、`lib/server/agent-core/action-validator.ts` 和 `lib/server/agent-core/response-renderer.ts`，确认内部错误如何进入 NDJSON `error`。
- [x] 1.3 复核 `features/chat/api/chat-client.ts`、`features/chat/hooks/use-chat-controller.ts` 和现有 chat controller 测试，确认 `event.error.message` 如何进入用户可见 assistant bubble 或页面错误区。
- [x] 1.4 运行 `git status --short`，隔离无关未提交改动，尤其不要混入其他 OpenSpec change 或 `docs/chat-push-flow.md` 的既有状态。
- [x] 1.5 复核 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认本 change 是 production 接入 / Response Renderer 投影修复，不是新增业务 tool。

## 2. 后端错误投影

- [x] 2.1 新增或调整用户可见错误文案 helper，定义 unsupported capability fallback 和 generic failure fallback，文案必须是中文、稳定、无内部错误细节。
- [x] 2.2 在 production text chat 响应创建路径中，根据 registry / action validation / runtime error code 等确定性事实识别 unknown tool、unsupported tool、tool call 不可执行、`repair_limit_exceeded` 和等价能力不支持场景。
- [x] 2.3 将 unsupported capability failure 投影为 `content` + 可选 `assistant_suggestions` + `done`，不得输出会被前端显示的 `terminalError.message`。
- [x] 2.4 保留 runtime result、traceEvents、error code 和脱敏 details，确保内部诊断仍可定位原始失败。
- [x] 2.5 确认 generic runtime / provider / configuration failure 也不会把服务端原文作为用户可见文本输出。

## 3. 前端安全兜底

- [x] 3.1 修改 `getAgentTextChatEventErrorMessage()` 或等价映射，停止返回 `event.error.message` 原文，改用稳定中文兜底或 code 到安全文案的白名单映射。
- [x] 3.2 修改 `getAgentTextChatErrorMessage()` 或 hook 错误处理，确保 HTTP 错误、stream 错误、非法 NDJSON 和 provider 错误不会把服务端 response body / Error.message 原样显示给用户。
- [x] 3.3 修改 `use-chat-controller` 的 `error` 事件投影，确保 assistant message 和页面错误区只出现安全文案，并清理 loading / reasoning 状态。
- [x] 3.4 确认前端仍保留 code / retryable 等内部状态用于测试或诊断，但不把 details 渲染到 UI。

## 4. 禁止回流检查

- [x] 4.1 确认 `/api/chat` 没有新增用户文本关键词、正则、同义词表或短句模板分流。
- [x] 4.2 确认 production text chat 仍使用空 `ToolRegistry`，不注册 fixture tool、动作库查询、训练生成、artifact 保存、用户记忆或任何真实业务 tool。
- [x] 4.3 如果触碰 `agent-core` Response Renderer，确认 core 中没有新增具体业务 toolName 分支。
- [x] 4.4 确认未恢复旧 `agent-orchestrator`、旧 `AgentExecutionResult`、旧 Response Writer、旧 `assistant_action` 或旧兼容事件。

## 5. 测试与验证

- [x] 5.1 更新 `tests/chat-service.test.ts`，覆盖空 registry 下模型连续返回 tool_call 时，NDJSON 输出安全 `content` / `assistant_suggestions` / `done`，不输出用户可见内部错误。
- [x] 5.2 更新 `tests/agent-core/executor-runtime-renderer.test.ts` 或新增 renderer 测试，覆盖 terminal error 不会被默认用户事件原样显示，同时内部 error code 仍可诊断。
- [x] 5.3 更新 `tests/client-api.test.ts`，覆盖 `error` 事件、HTTP 错误、非法 NDJSON 和 stream 错误不会返回服务端原始 message 作为用户可见文案。
- [x] 5.4 更新 `tests/chat-controller-stream-state.test.ts` 或等价 hook 测试，覆盖 assistant bubble 不再写入 `event.error.message`，并验证 loading / reasoning 清理。
- [x] 5.5 更新 `tests/agent-core/architecture-boundary.test.ts`，覆盖 production chat entrypoint 没有业务 tool 注册、fixture registry、旧链路、旧事件或关键词分流回流。
- [x] 5.6 运行 `openspec validate stabilize-agent-text-chat-unsupported-response --strict`。
- [x] 5.7 运行 `npm test -- tests/chat-service.test.ts tests/client-api.test.ts tests/chat-controller-stream-state.test.ts tests/agent-core/executor-runtime-renderer.test.ts tests/agent-core/architecture-boundary.test.ts`。
- [x] 5.8 运行 `npm run typecheck`。
- [x] 5.9 运行 `git status --short` 和相关 diff 检查，确认只包含本 change 相关文件，未混入无关改动。

## 6. 文档同步

- [x] 6.1 更新 `docs/agent-tool-orchestrator-design.md`，记录 production text chat 的用户可见错误投影边界和 unsupported capability fallback，不声明业务 tool 已接入。
- [x] 6.2 在 `docs/方案变更历史/` 新增本次核心链路修复记录，说明原问题、调整思路、关键改动和验证结果，时间使用上海时间精确到秒。
- [x] 6.3 在 `docs/项目演变历程.md` 末尾追加本次生产聊天错误投影修复摘要。
- [x] 6.4 检查相关文档是否仍描述“前端显示服务端 error message”或把 unsupported tool 当成用户可见错误，并按当前真实链路修正。
