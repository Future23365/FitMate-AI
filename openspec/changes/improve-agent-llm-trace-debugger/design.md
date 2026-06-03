## Context

`docs/agent-tool-orchestrator-design.md` 明确把职责切成 `/api/chat` 接入、`AgentRunInput` 构造、`ToolRegistry/Manifest`、`PlannerPort`、`ModelAdapter`、Runtime / Validator / Policy / Resource、Response Renderer 和 Trace / Replay。当前实现只在聊天接入层把 `AgentRunInput`、`AgentRunResult.traceEvents` 和 NDJSON 响应摘要写入 `AiTrace`，因此能看到 runtime 的结构化事件，却看不到 `LlmPlanner` 实际传给 DeepSeek 的 messages、response_format、模型原始 content、解析后的 action candidate、解析失败细节和 token usage。

真实缺口不在 `/dev/ai-traces` 单纯展示层，而是在 Planner / ModelAdapter 边界缺少可保存的观测合同。`DeepSeekModelAdapter` 已经能拿到 request body、raw content 和 `payload.usage`，`LlmPlanner` 也保存了 `calls` 和 `completions`，但这些数据没有被转换成 trace step，也没有按模块投影给页面。

任务分类：trace contract 变更 + production 接入变更。它不是新增业务 tool，也不是自然语言分流修复。

## Goals / Non-Goals

**Goals:**

- 记录每次 production 文本聊天 LLM 调用的安全请求摘要、模型响应摘要、raw text 摘要、parsed action、解析失败 code 和 token usage。
- 页面按架构模块展示 trace：入口与上下文、Registry/Manifest、Planner/ModelAdapter、Runtime/Validator/Policy/Resource、Response Renderer、错误与导出。
- 页面默认只展示排查问题最有用的信息：当前模块状态、关键 code/id、LLM 输入/输出摘要、token usage、失败边界、用户可见响应摘要。
- 保存全链路 log 保留更完整但脱敏的 request/response envelope、messages、raw model text、parsed action、runtime traceEvents 和 Raw trace payload。
- 保持 trace 写入非致命，不改变 `/api/chat` 的用户可见 NDJSON。

**Non-Goals:**

- 不注册 `searchExercises`、训练生成、artifact 保存、用户记忆或任何真实业务 tool。
- 不恢复旧 `agent-orchestrator`、旧 `AgentExecutionResult`、旧 `assistant_action`、旧 `intent_resolved` 或旧 Agent timeline view model。
- 不在 `/api/chat`、Planner、ModelAdapter 或 trace viewer 中加入用户文本关键词、正则、同义词或短句模板分流。
- 不新增持久化 trace 表，不修改 Prisma Schema。
- 不把 API key、authorization、cookie、完整敏感 payload、跨用户 payload 或完整 tool output 写入 trace。

## Decisions

### 1. 在 Planner / ModelAdapter 边界建立模型调用观测，而不是在 `/api/chat` 抓包

新增或扩展模型调用观测结构，例如 `PlannerModelTraceEvent` / `ModelActionCompletionTrace`。`DeepSeekModelAdapter` 负责生成厂商无关的安全 envelope：request config、messages 摘要、response_format、model、raw content 摘要、usage、http status、parse status。`LlmPlanner` 负责把 adapter completion 和 `PlannerInput` 关联到 step、manifestHash、action candidate 和 diagnostics。

取舍：在 `/api/chat` 外层包 `fetch` 可以拿到 HTTP body，但会把供应商协议和 API key 处理漏到 route 层，也无法稳定关联 `PlannerInput`、parsed action 和 validator 结果。放在 Planner / ModelAdapter 边界能遵守 `PlannerPort` 和模型厂商解耦原则。

### 2. 不修改 `PlannerPort`，优先通过 `LlmPlanner` 的诊断出口读取

`PlannerPort.decideNext()` 仍返回 `AgentAction` candidate，避免污染 `agent-core` 主循环。`LlmPlanner` 可以在实例上记录 `modelTraceEvents` 或等价诊断数组；聊天接入层在 `runAgentRuntime()` 完成后，如果 planner 是可诊断 planner，则读取这些安全事件并写入 `AiTrace`。

取舍：修改 `PlannerPort` 返回 `{ action, diagnostics }` 更类型化，但会牵动 `ReplayPlanner`、runtime、测试和未来 planner 实现。当前目标是补 production 文本聊天调试证据，先用 planner diagnostics 出口即可，后续如果多个 planner 都需要通用 trace hook，再升级 core contract。

### 3. Trace step 同时保存页面摘要和导出详情

每个模型调用写入两层信息：

- 页面摘要：模型、step、messages 数、latest user 摘要、tool count、observation/toolResult 数、token usage、parsed action type、toolName、失败 code。
- 导出详情：脱敏 messages、system prompt 摘要、user payload 摘要、raw model text 摘要、parsed JSON/action、diagnostics、usage、request body 安全摘要。

取舍：页面展示完整 prompt 会很吵，也容易让关键失败边界被淹没；但保存 log 必须能复盘 LLM 对话，所以完整诊断留在 Raw JSON / 保存 log 中。

### 4. Trace viewer 改为模块化 view model

在 `components/dev/ai-trace-viewer.tsx` 中抽出模块 view model，例如：

```txt
request_context
registry_manifest
planner_model
runtime_validation
resource_policy
response_rendering
errors_diagnostics
raw_export
```

页面顶部展示模块总览、状态、耗时和 token；模块内部展示关键 step。`model_request` / `model_response` 归入 `planner_model`，`validation_result` 归入 `runtime_validation`，`policy_decision` 和 `resource_registered` 归入 `resource_policy`，`response_write` 归入 `response_rendering`。

取舍：继续按 step type 分组实现简单，但用户无法理解每一步属于哪个架构职责，也看不出问题发生在哪个模块。模块 view model 更贴近架构文档和排查路径。

### 5. Token usage 使用真实 usage 优先，估算 token 作为预算证据

`ModelAdapter` 返回的 `usage.prompt_tokens`、`usage.completion_tokens`、`usage.total_tokens` 是模型实际用量，进入 `model_response` metadata。`runtime` 现有 `estimated_tokens` budget event 继续表示服务端预调用预算估算，不能当作真实模型计费。页面必须明确区分“真实 usage”和“预算估算”。

取舍：只展示估算 token 会误导排查成本；只展示真实 usage 又无法解释为什么某次调用前被预算挡住。两者都保留，但标签和模块位置要分开。

### 6. 导出仍走现有 `/api/dev/ai-traces` 保存接口

保存全链路 log 继续写入 `codex_logs/ai_trace_log.js`，但 payload 中新增 `moduleGroups`、`plannerModelCalls`、`tokenUsageSummary` 和 Raw trace。保存用户问答记录继续只追加用户问题和最终文本回答到 `codex_logs/prompt.js`。

取舍：不新增日志文件或持久化表，降低范围；现有导出接口已经有脱敏兜底，可以复用。

## Risks / Trade-offs

- [Risk] 记录 prompt 可能泄漏敏感字段。→ Mitigation：`ModelAdapter` 输出前先做字段白名单、`redactJsonValue()`、长文本截断；测试覆盖 apiKey、authorization、cookie、payload、tool output。
- [Risk] 页面展示过多信息导致更难读。→ Mitigation：默认模块总览只展示关键摘要；完整 request/response 放在模块展开和保存 log。
- [Risk] `LlmPlanner` 诊断数组与 runtime step 对齐不准。→ Mitigation：记录 planner call index、runtime step、runId、manifestHash 和 action type；测试覆盖多轮 repair。
- [Risk] 未来非 DeepSeek adapter 没有同等诊断字段。→ Mitigation：定义供应商无关的 `ModelActionCompletionResult.trace` 可选字段；缺失时页面显示“未记录模型请求”，不推断失败。
- [Risk] token usage 字段名称随供应商变化。→ Mitigation：归一化为 `prompt_tokens`、`completion_tokens`、`total_tokens`，原始 usage 仅在 Raw log 中保留脱敏摘要。

## Migration Plan

1. 扩展 ModelAdapter / LlmPlanner 安全诊断结构，不修改 `PlannerPort`。
2. DeepSeek adapter 生成 request / response / usage / parse diagnostics 的安全 envelope。
3. 文本聊天 trace helper 读取 planner diagnostics，写入 `model_request`、`model_response` 和 token usage steps。
4. Trace viewer 新增模块化分组和 log export payload。
5. 增加后端、HTTP、viewer、architecture boundary 和 typecheck 验证。
6. 回滚策略：移除 planner diagnostics 到 `AiTrace` 的投影即可恢复旧 trace 展示，不影响 `/api/chat` NDJSON。

## Open Questions

无。是否把 planner diagnostics 升级为 `PlannerPort` 正式返回值不在本 change 内；等多个 planner 或 replay 需要同一 contract 时再独立评估。
