## Context

当前生产聊天链路已经是 LangChain Agent Runtime + DeepSeek native `tool_calls`。最新 trace 排查发现，`codex_logs/ai_trace_log.js` 对 tool call、tool 执行、失败码、token usage 和 tool result 的模型可见摘要基本可用，但对模型实际可见输入不完整。

代码证据：

- `createLangChainModelCallTraceRecorder()` 在 LangChain `wrapModelCall` 中拿到了真实 `request`，但只保存 `summarizeLangChainModelRequest()` 的结果。
- `summarizeLangChainModelRequest()` 目前只返回 `messageCount`、`messagePreviews`、`toolCount` 和 `toolNames`。
- `LangChainAgentModelCallTrace["requestSummary"]` 类型没有 system prompt、tool description、schema description、finalization tool、模型参数或完整 ToolMessage content 字段。
- `recordLangChainAgentRuntimeDetailTrace()` 写入 `model_request` step 时只能写 `messagePreviews` 和 `toolNames`。
- `/dev/ai-traces` 导出的 `longTexts` 只能外置 payload 中已经存在的长文本，不能恢复 runtime 没记录的 prompt 或 tool schema。

因此，目前 trace 可以回答“模型第几轮请求了哪个 tool、服务端有没有执行、为什么失败”，但不能回答“本轮模型是否真的看到了新增 prompt/tool description/schema description”。这也是本 change 要单独成立的原因：它修的是 trace 可观测性合同，不是 Shadow Probe 功能，也不是训练计划生成策略。

## Goals / Non-Goals

**Goals:**

- 让每次 LangChain model request trace 都能记录完整的模型可见输入快照或明确标记缺失。
- 让 `ai_trace_log.js` / `ai_trace_texts.jsonl` 能审计 system prompt、messages、tool description、schema description、finalization tool、预算和工具可用性。
- 给每次模型请求增加 `modelVisibleInputAudit`，记录来源、长度、hash / fingerprint、完整性和缺失字段。
- 给 message package 增加重复消息风险审计，用于定位 hydration / input assembly 问题。
- 保持 tool execution visibility 的现有分层：`modelVisibleSummary` 进入模型，`userProjection` 和 `traceSummary` 不默认进入模型。
- 保持生产模型调用行为、tool choice 策略、业务 handler 和用户可见响应不变。

**Non-Goals:**

- 不修改 prompt 文案、tool description、schema description 或训练计划生成规则。
- 不新增服务端自然语言关键词分流、用户 phrasing 特判或 provider `tool_calls` 改写。
- 不把 trace 可观测性修复混入 `add-codex-shadow-llm-probe`。
- 不要求保存完整 raw provider payload、API key、cookie、authorization 或完整数据库 payload。
- 不把 tool handler 的完整 raw output 暴露给模型或默认导出。

## Decisions

### 1. 在 LangChain `wrapModelCall` 边界记录模型可见输入

`wrapModelCall` 是当前最接近真实 provider request 的可观测入口。实现应在该边界扩展 request summary，而不是在 viewer/export 里倒推 prompt。

新增或扩展的 request snapshot 至少包含：

- `systemPrompt` 或 LangChain 已归一化后的 system message 内容。
- `messages` 的 role、content 长文本 envelope、长度、hash / fingerprint。
- 当前 provider request 暴露的 tool name、description、input schema、schema description、hash / fingerprint。
- finalization tool name、description、schema、hash / fingerprint。
- 模型名称、temperature、max tokens、timeout、tool availability、当前轮次、剩余 tool/model budget。
- `modelVisibleInputAudit`，记录 `sourceKind`、`completeness`、`missingModelVisibleParts[]` 和各字段来源。

取舍：

- 在 runtime trace 边界记录，比在导出层拼接更接近事实来源。
- 只新增 dev trace 字段，不改变 provider request，因此不会改变生产模型行为。

### 2. 长文本用现有 long text envelope / refs 承载

system prompt、message content、tool description 和 schema description 可能很长。实现应复用现有 trace long text envelope / `contentRef` / `detailRef` 机制，避免把大文本直接塞进轻量 log。

导出语义必须明确：

- `ai_trace_log.js` 里的 `contentRef` 表示该字段的完整内容在 `ai_trace_texts.jsonl`。
- 如果某类模型可见字段没有进入 trace payload，导出层不得用“长文本已外置”的说明暗示它已保存。
- `ai_trace_texts.jsonl` 的 `kind` / path 应能区分 system prompt、message content、tool description、schema description、tool result summary。

取舍：

- 轻量 log 继续适合快速扫描。
- 需要完整排查时可以按 `contentRef` 精确回查，不整文件读取。

### 3. 用 `modelVisibleInputAudit` 明确完整性，而不是让开发者猜

每轮模型请求必须有审计摘要：

- `sourceKind`: `runtime_model_request` 或等价当前真实 runtime 来源。
- `completeness`: `complete` / `incomplete`。
- `missingModelVisibleParts[]`: 缺 system prompt、tool description、schema description、finalization tool、完整 messages、budget 时列出。
- `hash / fingerprint`: 支持对比源代码、构建产物、trace 导出和同一 run 内不同轮次。
- `duplicateMessageRisk`: 记录连续或同内容 user message 的风险，不直接判定为错误。

取舍：

- 增加 trace 体积和测试工作，但能避免“日志不完整却被当作完整证据”的误判。

### 4. 保持 tool execution 可见性语义不变

现有 tool execution 报告区分：

- `modelVisibleSummary`: 进入模型上下文。
- `userProjection`: 用户可见投影。
- `traceSummary`: debug-only 诊断摘要。

本 change 不改变这套语义，只要求 model request snapshot 能关联到对应 ToolMessage / `modelVisibleSummary`，并避免把完整 execution record 误认为模型可见。

### 5. 报告重复消息风险，但不在 trace 层修复语义

最新 trace 中出现两条相同 human message。trace 层应记录 message hash、role、顺序和重复风险，帮助定位 hydration / input assembly 问题。

trace 层不得因为发现重复消息就删除、合并或改写 messages；是否修复上游 hydration 需要另一个针对 input assembly 的 change 或任务。

## Risks / Trade-offs

- **trace 体积增加** → 复用 long text refs，只在轻量报告保留 hash、长度和引用。
- **误把 schema raw object 泄漏到日志** → 记录脱敏 JSON schema / schema description，继续禁止 secret、cookie、authorization、跨用户 payload 和完整 handler output。
- **provider / LangChain request 结构变化** → request snapshot 通过 adapter 函数读取字段，缺失时写入 `missingModelVisibleParts[]`，不抛业务错误。
- **重复 message 被误判为根因** → 只标记风险，不自动判定、不自动修复。
- **开发者继续看旧字段** → viewer/export 和测试必须让旧 `messagePreviews + toolNames` 明确只是摘要，不是完整模型输入。

## Migration Plan

1. 扩展 LangChain model call trace 类型和 request snapshot 构造函数。
2. 在 `wrapModelCall` 记录 system prompt、messages、tools、schema、finalization tool、budget 和 `modelVisibleInputAudit`。
3. 更新 chat service 的 `model_request` trace step 写入完整 snapshot / refs。
4. 更新 `/dev/ai-traces` 保存全链路 log 的 long text extraction、detailRef、visibility 标注和文案。
5. 补充 runtime trace、trace export、long text mapping、脱敏和重复 message 风险测试。
6. 回归检查最新问题 trace：如果 prompt/tool schema 没记录，应显示 incomplete；如果已记录，应能通过 `contentRef` 精确查到。

回滚方式：移除新增 dev trace 字段和 viewer/export 展示，不影响生产聊天响应。已导出的旧日志继续按旧格式读取，但必须标记为缺少完整模型可见输入快照。

## Open Questions

- 是否把 tool JSON schema 的完整对象全部记录为 long text，还是只记录字段名、description 和 hash，并在 detailRef 中保存脱敏结构？
- 是否需要为历史导出的 `codex_logs/ai_trace_log.js` 增加版本标记，明确旧日志不具备模型可见输入完整性证明能力？
