## Why

当前 log-traces 页面仍以阶段指标、摘要卡片和 Raw JSON 为主，开发者很难直接看懂 Tool-first Agent 主链中每一轮 LLM 到底看到了什么、决定调用哪些 tool、tool 返回了什么，以及这些结果如何进入下一轮 LLM 输入。

现在 AI 核心链路已经是 Agent loop，调试页需要从“指标解释页”调整为“Agent loop 可复盘页”，优先展示 `LLM 输入 -> LLM 输出解析 -> tool 执行结果 -> 下一轮 LLM 输入 -> 最终结果` 的因果链。

## What Changes

- `/dev/ai-traces` 或现有 log-traces 页面默认以 Agent loop 时间线展示每一轮模型调用，而不是先展示大量指标卡片。
- 每一轮 loop 必须展示本轮 LLM 输入，包括 system prompt、user payload、模型可见的 `ContextPackage`、已登记 tool results、dependency graph 和剩余预算摘要。
- 每一轮 loop 必须展示 LLM 原始输出和解析后的结构化输出，特别是 `action`、`toolName`、tool input、reason、`usedToolResultIds`、blocked / final result 等字段。
- tool 执行必须紧跟触发它的 LLM 输出展示，包含 toolName、输入摘要、输出摘要、状态、失败 code、toolResultId、candidateSetId、artifactId、validationId、policyDecisionId、revisionId 等关键资源 id。
- 下一轮 LLM 输入必须明确标注“上一轮 tool result 如何进入本轮 prompt”，让开发者能确认模型是否真的看到了工具结果。
- 最终回复必须展示为 Agent loop 的收口节点，关联 `AgentExecutionResult`、Response Writer 输入摘要、用户可见回复和实际产生的 artifact / patch / suggestion 事件。
- 指标类内容保留但降级为辅助信息，必须有中文解释，说明 token、duration、skip reason、resource id、dependency graph 等指标用于判断什么问题。
- 保存全链路 log 时必须包含 Agent loop timeline、LLM 输入输出摘要、tool 执行结果和资源关联，不再只导出按阶段分组的事件列表。
- 不新增生产业务行为，不改变 Agent 决策、tool 执行、权限、持久化或用户可见回复合同。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `ai-trace-debugger`: 调整 trace 调试页的信息架构，要求默认按 Agent loop 展示 LLM 输入、LLM 输出解析、tool 执行结果、下一轮 LLM 输入和最终回复，并解释辅助指标含义。
- `ai-run-trace`: 补强 trace 记录合同，确保每轮 Agent loop 具备可串联的模型输入、模型输出、解析结果、tool result、资源 id、下一轮 prompt 可见性和最终结果引用。

## Impact

- 影响 `components/dev/ai-trace-viewer.tsx`、`components/dev/agent-trace-view-model.ts`、`app/api/dev/ai-traces/route.ts`、`lib/server/dev/ai-trace-store.ts`、`lib/server/dev/ai-run-trace.ts`、`lib/server/chat/chat-service.ts`、`lib/server/agent-orchestrator/*` 以及相关测试。
- 需要补充或调整 `tests/ai-trace-viewer.test.ts`、`tests/ai-trace-http.test.ts`、`tests/fixtures/agent-traces.ts`，覆盖 Agent loop 串联、LLM 输入输出展示、tool result 关联和导出格式。
- 需要同步更新 `openspec/specs/ai-trace-debugger` 与 `openspec/specs/ai-run-trace` 的要求。
