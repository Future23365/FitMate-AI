## 1. 前置确认

- [ ] 1.1 复核 `app/api/chat/route.ts`、`lib/server/chat/agent-text-chat-service.ts`、`lib/server/dev/ai-trace-store.ts` 和 `components/dev/ai-trace-viewer.tsx` 的当前真实链路，确认 `/api/chat` 文本聊天未写入 `AiTrace`。
- [ ] 1.2 复核 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认本 change 属于 production 接入变更 + trace contract 变更，不是新增业务 tool。
- [ ] 1.3 运行 `git status --short`，确认实现前工作区状态，并隔离无关未提交改动。

## 2. Trace 接入实现

- [ ] 2.1 在聊天接入服务中新增局部 trace lifecycle helper，例如 `recordAgentTextChatTrace()` 或等价函数，负责创建、更新和结束 `AiTrace`。
- [ ] 2.2 在成功 runtime 路径中把 `PreparedChatRequest`、`CurrentUser`、`AgentRunInput`、`AgentRunResult` 和已渲染 NDJSON 事件投影为 trace steps。
- [ ] 2.3 在缺少 DeepSeek 配置的错误路径中创建 failed trace，记录稳定配置错误 code 和最终错误事件摘要。
- [ ] 2.4 在 runtime 失败、非法 action、未知 tool、预算耗尽或 planner 失败路径中记录 terminal error、runtime status 和最终错误响应摘要。
- [ ] 2.5 确保 trace 写入失败为非致命行为，不改变 `/api/chat` 返回给前端的 NDJSON 响应。

## 3. Trace 投影与展示

- [ ] 3.1 为 `AgentRunResult.traceEvents` 增加字段白名单投影，覆盖 `registry_snapshot`、`budget_event`、`planner_action`、`validation_result`、`terminal_grounding`、`policy_decision`、`resource_registered` 或等价 runtime event。
- [ ] 3.2 确保 trace 投影使用脱敏、截断和安全摘要，不写入 API key、authorization、cookie、跨用户 payload、完整 tool output 或未经摘要的大 payload。
- [ ] 3.3 按需调整 `AiTraceStepType`、step label 或 `groupTraceSteps()`，让当前文本聊天 trace 在 `/dev/ai-traces` 中能清晰展示请求输入、runtime 事件、validation、response write 和 error。
- [ ] 3.4 确认保存全链路 log 继续写入 `codex_logs/ai_trace_log.js`，保存用户问答记录继续追加写入 `codex_logs/prompt.js`，且两者遵守窄格式和脱敏边界。

## 4. 文档同步

- [ ] 4.1 更新 `docs/agent-tool-orchestrator-design.md`，记录 production 文本聊天 trace 已通过新 `agent-core` 接入，且不恢复旧 Agent 事件或业务 tool。
- [ ] 4.2 在 `docs/方案变更历史/` 新增本次核心链路调整记录，说明原问题、调整思路、关键改动和验证结果。
- [ ] 4.3 在 `docs/项目演变历程.md` 末尾追加本次 production trace 接入摘要。
- [ ] 4.4 检查 `docs/chat-push-flow.md`、`docs/architecture.md` 中仍描述 `chat_ai_disabled` 或无 trace 的过期内容，并按当前真实链路同步修正。

## 5. 测试与验证

- [ ] 5.1 运行 `openspec validate connect-agent-text-chat-trace-log --strict`。
- [ ] 5.2 增加或更新 `tests/chat-service.test.ts`，覆盖 final answer、ask user、配置错误和 runtime failure 都会写入当前用户 trace。
- [ ] 5.3 增加或更新 `tests/api-routes.test.ts`，覆盖 `/api/chat` 成功 NDJSON 和配置错误路径的 trace 生产，不返回旧 `chat_ai_disabled`。
- [ ] 5.4 增加或更新 `tests/ai-trace-http.test.ts`，覆盖 trace 用户隔离、保存全链路 log、保存用户问答记录和脱敏截断边界。
- [ ] 5.5 增加或更新 `tests/ai-trace-viewer.test.ts`，覆盖文本聊天 trace step 分组、空 registry 展示和 Raw JSON 保留。
- [ ] 5.6 运行 `npm test -- tests/chat-service.test.ts tests/api-routes.test.ts tests/ai-trace-http.test.ts tests/ai-trace-viewer.test.ts`。
- [ ] 5.7 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts`，确认没有旧 `agent-orchestrator`、旧事件、fixture tool、真实业务 tool 或关键词分流回流。
- [ ] 5.8 运行 `npm run typecheck`。
- [ ] 5.9 运行 `git status --short` 和 diff 检查，确认只包含本 change 相关文件，且未混入无关改动。
