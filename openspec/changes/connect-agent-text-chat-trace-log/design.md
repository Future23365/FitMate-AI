## Context

`enable-agent-text-chat-flow` 已经把 production `/api/chat` 接到新 `agent-core` 文本聊天闭环：`PreparedChatRequest -> AgentRunInput -> 空 ToolRegistry -> LlmPlanner + DeepSeekModelAdapter -> runAgentRuntime -> renderAgentResponseEvents -> NDJSON`。当前主链能返回文本、澄清建议、配置错误和 runtime 错误，但没有创建开发态 `AiTrace`。

`/dev/ai-traces` 现有页面和 `/api/dev/ai-traces` API 仍然存在，但它们只读取 `globalThis.__fitmateAiTraceStore` 中的内存 trace。`codex_logs/ai_trace_log.js` 只是开发者在页面点击保存后的导出文件，不会被页面反向加载。结果是新文本聊天请求不会出现在日志页，排查模型输出、runtime 校验和最终响应时缺少生产链路证据。

任务分类：production 接入变更 + trace contract 变更。它不是新增业务 tool，也不是 Agent tool bug 修复。本 change 允许触碰 `/api/chat` 的文本聊天薄接入层和开发态 trace 投影，不允许恢复旧 `agent-orchestrator`、旧 `AgentExecutionResult`、旧业务 stream 事件或服务端自然语言分流。

## Goals / Non-Goals

**Goals:**

- 为已认证且请求体验证通过的 `/api/chat` 文本聊天请求创建当前用户可见的 `AiTrace`。
- 将 `AgentRunInput`、`AgentRunResult.traceEvents`、runtime 终止状态、结构化错误和最终 NDJSON 白名单事件摘要写入 trace。
- 让 `/dev/ai-traces` 能展示当前文本聊天请求的流程、Raw JSON、保存全链路 log 和保存用户问答记录。
- 保持 trace 写入非致命：日志写入失败不得改变用户可见聊天响应。
- 增加 OpenSpec、后端、前端 trace viewer 和架构扫描验证。

**Non-Goals:**

- 不新增 `searchExercises`、训练生成、artifact 保存、用户记忆、数据库查询或任何真实业务 tool。
- 不修改 `PlannerPort`、Executor 主流程、Policy Guard 主流程、Resource Contract Validator 主流程或 Response Renderer 主流程。
- 不新增持久化 trace 表，不修改 Prisma Schema 或数据库迁移。
- 不恢复旧 `assistant_action`、旧 `intent_resolved`、旧 `agent_execution_result`、旧 `AgentExecutionResult` 或旧 Agent timeline view model。
- 不让 `/dev/ai-traces` 读取或导入 `codex_logs/ai_trace_log.js` 历史文件。

## Decisions

### 1. Trace 生命周期放在聊天薄接入层，不放进 `agent-core`

`createAgentTextChatResponse()` 或其局部 helper 负责创建、更新和结束 `AiTrace`。`agent-core` 继续只返回 `AgentRunResult`，不知道 HTTP route、开发态 trace store、用户 cookie 或页面展示。

取舍：把 trace logger 注入 `runAgentRuntime()` 可以记录更细粒度的实时 step，但会让通用 runtime 感知开发态存储和 production route。先在聊天接入层投影 `AgentRunResult.traceEvents`，能修复日志页断链，同时保持 core 边界干净。

### 2. 使用专用投影 helper 转换 `AgentRunResult.traceEvents`

新增局部投影 helper，例如 `recordAgentTextChatTrace()`，输入为 `PreparedChatRequest`、`CurrentUser`、`AgentRunInput`、`AgentRunResult` 和已渲染 NDJSON 事件。helper 只负责把安全摘要写入 `AiTrace`：

- 请求输入：route、runId、conversationId、responseMessageId、latestUserMessage、hydration 摘要。
- runtime 事件：`registry_snapshot`、`budget_event`、`planner_action`、`validation_result`、`terminal_grounding`、`policy_decision`、`resource_registered` 等事件的脱敏摘要。
- 终止结果：completed、needs_input、requires_confirmation、failed、terminal action type、terminal error code。
- 响应写入：最终返回的事件类型列表、文本摘要、建议数量和错误 code。

取舍：直接把完整 `AgentRunResult` 塞进单个 Raw JSON 最快，但会降低页面可读性，也容易把完整 output、模型响应或未来 tool payload 带进 trace。专用 helper 能集中执行字段白名单、截断和脱敏。

### 3. 先使用现有开发态 `AiTrace` store，不新增持久化

本阶段继续使用 `lib/server/dev/ai-trace-store.ts` 的内存 store 和 `/api/dev/ai-traces` 用户过滤。`ENABLE_AI_TRACE_LOG` / `NODE_ENV` 的启用逻辑保持不变。

取舍：数据库持久化 trace 更利于跨进程复盘，但会引入 Schema、迁移、保留策略和权限查询。本问题是当前日志页完全没有新请求，先恢复现有开发态链路更可控。

### 4. 配置错误和 runtime 失败也必须 trace

只要 `/api/chat` 已完成鉴权和请求体验证，并进入文本聊天接入服务，就应创建 trace。缺少 `DEEPSEEK_API_KEY`、planner 返回非法 action、空 registry 下未知 tool、预算耗尽或 terminal error 都要结束为 failed trace，并记录稳定错误 code。

取舍：只记录成功请求会让“页面没回复”和“模型配置缺失”继续无证据。对所有进入 AI 接入层的请求建 trace，可以把配置、模型、runtime 和响应投影问题统一复盘。

### 5. 先渲染一次响应事件，再同时用于 trace 和 NDJSON

`renderAgentResponseEvents(result)` 应只调用一次，结果同时用于 trace 摘要和 `createAgentTextChatNdjsonResponse()`。配置错误路径也应先构造同一份错误事件数组，再写 trace 和返回。

取舍：为 trace 重新渲染一次会引入响应内容和日志内容不一致的风险。复用同一事件数组可以保证 trace 中的响应摘要来自真实返回给前端的事件。

### 6. Trace 页面继续走通用历史查看器

`/dev/ai-traces` 不恢复旧 Agent 诊断 view model。对于当前文本聊天 trace，页面只需要按 step 分组展示、保留 Raw JSON，并让保存全链路 log / 用户问答记录可以读取最新 trace。

取舍：恢复旧 loop timeline 可能更熟悉，但当前新 `agent-core` 的 trace contract 已不同于旧 Tool-first Domain Agent。先保持通用 viewer，避免用旧模型误解释新链路。

## Risks / Trade-offs

- [Risk] `AgentRunResult.traceEvents` 信息不足以还原模型完整输入输出。→ Mitigation：本阶段记录 runtime 事件和最终响应摘要；完整模型 request/response 的更深追踪如需实时 planner instrumentation，应另起 core contract change。
- [Risk] 未来业务 tool 接入后 trace 泄漏完整 tool output。→ Mitigation：投影 helper 使用字段白名单和 `redactJsonValue` / `sanitizeTraceValue`，测试覆盖 secret、长文本和完整 output 不进入 trace。
- [Risk] trace 写入异常影响聊天响应。→ Mitigation：继续复用 `protectTraceWrite` 风格，所有 trace 写入失败只记录 warning，不改变 NDJSON。
- [Risk] in-memory trace 在 dev server 重启或多进程下丢失。→ Mitigation：这是现有开发态 store 的既有边界；本 change 不承诺持久化。
- [Risk] 当前 `ai-run-trace` 历史规格仍包含旧 `AgentExecutionResult` 文案。→ Mitigation：本 change 的 delta 用新 `AgentRunResult` 文本聊天要求补充当前真实链路，不在本阶段重写全部历史规格。

## Migration Plan

1. 在聊天接入服务中创建 trace lifecycle helper，并保证配置错误、成功和失败路径都会 finish。
2. 增加 `AgentRunResult.traceEvents` 到 `AiTrace` step 的字段白名单投影。
3. 调整 `/dev/ai-traces` 必要的 step label 或分组，使当前文本聊天 trace 可读，但不恢复旧 Agent view model。
4. 增加后端、HTTP route、trace viewer 和架构扫描测试。
5. 更新架构文档和项目演变文档，说明 production 文本聊天 trace 已恢复。
6. 回滚策略：移除新增 trace helper 调用即可恢复到当前文本聊天无 trace 状态，不影响核心聊天 NDJSON 协议。

## Open Questions

无。持久化 trace、业务 tool traceProjection、模型 adapter 级原始 request/response instrumentation 都不在本 change 内。
