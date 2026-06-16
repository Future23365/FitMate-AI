## ADDED Requirements

### Requirement: Codex trace log export is token efficient
`/dev/ai-traces` SHALL export Codex-oriented trace logs with a small default report and ref-based evidence expansion, so routine debugging does not require reading full model input snapshots or repeated schema payloads.

#### Scenario: 默认报告只保存排障索引
- **WHEN** 开发者点击保存全链路 log
- **THEN** `codex_logs/ai_trace_log.js` MUST contain a compact index report with trace summary, loop timeline, failure index, token usage summary, file manifest and lookup guide
- **AND** `codex_logs/ai_trace_log.js` MUST NOT inline full `modelVisibleInputSnapshot`, full Raw trace detail, full handler output, repeated tool schema, repeated prompt text or repeated schema description
- **AND** the report MUST preserve enough fields to identify route, title, status, finalDecision, errorCode, loopNumber, plannerCallIndex, runtimeStep, stepId, toolName, status, token usage and related refs

#### Scenario: 多轮 Agent loop 不重复写入 schema
- **WHEN** a trace contains multiple model calls using the same system prompt, tool catalog, tool schema, tool description or finalization schema
- **THEN** export MUST write each unique prompt/schema/tool catalog payload once by hash
- **AND** later model input records MUST reference the existing ref and hash instead of duplicating the content
- **AND** the default report MUST show only the catalog summary, hash and ref needed to locate the full content

#### Scenario: 模型输入按需展开
- **WHEN** a model call contains messages, tool catalog, budget, toolAvailability or model-visible audit data
- **THEN** export MUST write the model input evidence to `codex_logs/ai_trace_model_inputs.jsonl` or an equivalent model-input mapping file
- **AND** the default report MUST reference it by `modelInputRef`
- **AND** each model input record MUST contain plannerCallIndex, runtimeStep, message count, tool count, tool names, model-visible audit summary and refs for long message content

#### Scenario: 事件明细按 loop 和 ref 检索
- **WHEN** a trace contains model calls, model responses, tool executions, runtime validation, final response projection or terminal failure
- **THEN** export MUST write searchable event records to `codex_logs/ai_trace_events.jsonl` or an equivalent event mapping file
- **AND** each event record MUST include eventRef, kind, loopNumber when available, stepId, plannerCallIndex when available, runtimeStep when available, toolName when available, status, code when available, tokenUsage when available and refs to related input/output/detail records
- **AND** the default report MUST include lookup examples that allow Codex to find events by eventRef, loopNumber, stepId and toolName with `rg`

#### Scenario: 引用必须可追溯
- **WHEN** the default report contains contentRef, detailRef, modelInputRef, eventRef, schemaRef, toolCatalogRef or equivalent refs
- **THEN** every ref MUST resolve to exactly one header or record in the saved mapping files
- **AND** referenced records MUST include enough metadata to identify kind, path, hash, originalLength when applicable, preview when applicable and related event or model input when applicable
- **AND** chunked long text records MUST remain reconstructable by parentRef and chunkIndex

### Requirement: Trace log export preserves debugging boundaries
`/dev/ai-traces` SHALL preserve the current debugging and safety boundaries while optimizing saved log structure for Codex retrieval.

#### Scenario: 保存格式优化不改变生产行为
- **WHEN** the trace log export format is optimized
- **THEN** `/api/chat` production behavior MUST remain unchanged
- **AND** LangChain Agent runtime model input, tool calling strategy, tool handlers, model-visible tool summaries, finalization behavior and user-visible response projection MUST remain unchanged
- **AND** the change MUST be limited to dev trace viewing/export and save-log persistence code

#### Scenario: 敏感字段仍不进入默认报告
- **WHEN** saved trace data contains authorization, cookie, API key, secret, cross-user payload, full handler output or other sensitive fields
- **THEN** export MUST continue to redact or omit those fields from the default report and mapping files
- **AND** optimizing the export structure MUST NOT reintroduce sensitive fields through new event, model input or schema mapping records

#### Scenario: 保存用户问答记录不受影响
- **WHEN** developer clicks 保存用户问答记录
- **THEN** the system MUST continue to save only user questions and final text answer to `codex_logs/prompt.js`
- **AND** the optimized full trace log export MUST NOT change prompt log append semantics

## MODIFIED Requirements

### Requirement: Agent loop log export is readable
`/dev/ai-traces` SHALL export Agent loop logs in the same causal structure used by the page, while separating long text, full model input snapshots and repeated schema payloads from the default report.

#### Scenario: 保存全链路 log
- **WHEN** 开发者点击保存全链路 log
- **THEN** 系统 MUST 写入包含 Agent loop timeline 的轻量索引报告 `codex_logs/ai_trace_log.js`
- **AND** 保存内容 MUST 包含每轮 LLM 输入摘要、LLM 输出解析、tool 执行结果、resource links、diagnostic findings、final result 和用户可见回复摘要
- **AND** 保存内容 MUST 将超过导出阈值的长文本替换为 `contentRef` 引用
- **AND** 被引用的长文本 MUST 写入 `codex_logs/ai_trace_texts.jsonl`
- **AND** 模型请求 message content 已在上游 trace 中以 chunks 保存时，导出层 MUST 合并 chunks 并只在默认报告中留下 `contentRef` 或 `modelInputRef`
- **AND** 保存内容 MUST 使用 step summary 或 trace summary 代替完整 Raw trace 对象
- **AND** 被 step summary 或 trace summary 代替的完整结构化详情 MUST 能通过 `detailRef` 在映射文件中找回
- **AND** 完整 `modelVisibleInputSnapshot`、完整 tool catalog、完整 tool schema、完整 prompt/schema description 和完整 finalization schema MUST NOT inline in `codex_logs/ai_trace_log.js`
- **AND** 模型输入快照 MUST 能通过 `modelInputRef` 在 `codex_logs/ai_trace_model_inputs.jsonl` 或等价映射文件中找回
- **AND** model/tool/runtime event details MUST 能通过 `eventRef` 在 `codex_logs/ai_trace_events.jsonl` 或等价映射文件中找回
- **AND** 重复 prompt、tool description、tool schema、schema description 和 finalization schema MUST be deduplicated by hash and referenced by stable refs
- **AND** 报告 MUST 保留足够定位问题的 code、id、状态、step、token usage、hash、路径和 refs 信息，便于只读默认报告完成常规排查

#### Scenario: 保存用户问答记录
- **WHEN** 开发者点击保存用户问答记录
- **THEN** 系统 MUST 继续只写入用户问题列表和最终文本回答
- **AND** 保存内容 MUST NOT 包含完整 prompt、tool payload、动作卡片、训练计划卡片、权限 token、敏感字段或长文本映射
