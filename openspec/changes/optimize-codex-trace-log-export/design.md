## Context

`/dev/ai-traces` 的「保存全链路 log」当前会写入 `codex_logs/ai_trace_log.js` 和 `codex_logs/ai_trace_texts.jsonl`。长文本已经通过 `contentRef` 外置，但默认报告仍会内联每轮 `plannerModelCalls[].request.modelVisibleInputSnapshot` 的结构化快照，导致 tool schema、schema description、finalization tool schema、历史 messages 和 tool observation 在多轮 Agent loop 中重复出现。

这个保存结果主要给 Codex 读取，不是给人工逐行阅读。Codex 的高效排障路径应当是：先读极小的因果索引，定位失败 loop、tool、model call 和错误边界，再用 `rg` 按 ref 精确展开必要证据。

## Goals / Non-Goals

**Goals:**

- 默认 `ai_trace_log.js` 控制为低 token 索引报告，优先回答“哪里失败、为什么失败、下一步查哪个 ref”。
- 将模型输入快照、事件明细、长文本、完整 detail 和去重 schema 拆到 JSONL，支持按 ref / hash / loop / stepId 精确检索。
- 对 system prompt、tool catalog、tool schema、tool description、finalization schema 和重复 observation 做 hash 去重，避免每轮重复写入。
- 保留足够的状态、code、id、token usage、toolName、stepId、plannerCallIndex、runtimeStep、hash 和文件引用，保证 Codex 不展开长文本也能完成常规原因定位。
- 保持 trace 导出脱敏、权限和敏感字段边界，不把完整 handler output、secret、cookie、authorization 或跨用户 payload 写入默认报告。

**Non-Goals:**

- 不改变 `/api/chat` 生产执行链路。
- 不改变 LangChain Agent runtime 的模型输入、tool calling 策略、tool handler、业务 tool summary 或 finalization 合同。
- 不改变 `/dev/ai-traces` 页面交互主流程。
- 不把保存结果设计成人工完整阅读的漂亮报告；人工可读性让位于 Codex 低成本检索。

## Decisions

### Decision 1: 保留 `ai_trace_log.js` 作为唯一默认入口，但只保存索引

默认入口继续使用 `codex_logs/ai_trace_log.js`，避免破坏现有“先读这个文件”的工作流。该文件只包含：

- `traceSummary`: title、savedAt、route、status、durationMs、stepCount、finalDecision、errorCode。
- `loopTimeline`: 每轮 loop 的 modelCall、toolName、status、token usage、关键 refs。
- `failureIndex`: 最后失败事件、terminal finalizer、错误 code、直接相关的 model input / tool result / event refs。
- `tokenUsageSummary`: 全链路和逐模型调用 token usage 摘要。
- `lookupGuide`: 针对当前 trace 生成的 `rg` 命令模板。
- `fileManifest`: 本次保存实际写出的文件、记录数量、去重数量、阈值和 schema version。

替代方案是把主报告改成 Markdown。放弃该方案，因为当前保存 API 和排障习惯已经围绕 CommonJS payload，保留 `.js` 可以减少迁移成本，同时仍可通过精简 payload 降低 token。

### Decision 2: 模型输入快照单独写入 `ai_trace_model_inputs.jsonl`

每次模型调用写一条 `model_input` 记录，使用 `modelInputRef`、`plannerCallIndex`、`runtimeStep`、`messageRefs`、`toolCatalogRef`、`finalizationToolRef`、`budget`、`toolAvailability` 和 `audit` 描述模型实际可见输入。完整 message content、system prompt 和长 observation 继续通过 `contentRef` 指向 `ai_trace_texts.jsonl`。

主报告不得内联 `modelVisibleInputSnapshot`。它只保留该轮 `modelInputRef` 和审计摘要，例如 message 数、tool 数、是否捕获完整、缺失字段列表。

替代方案是继续把 snapshot 放在主报告但降低 pretty print。放弃该方案，因为即使压缩为单行，Codex 默认读取时仍会摄入大量重复 schema 和 messages。

### Decision 3: 事件明细单独写入 `ai_trace_events.jsonl`

每个可诊断事件写一条 JSONL，包括 model call、model response、tool execution、runtime validation、final response、terminal failure、response projection 等。事件记录必须包含稳定字段：

- `eventRef`
- `kind`
- `loopNumber`
- `stepId`
- `plannerCallIndex`
- `runtimeStep`
- `toolName`
- `status`
- `code`
- `tokenUsage`
- `inputRef`
- `outputRef`
- `detailRef`

主报告只保留关键事件列表和失败链路引用。Codex 需要细节时用 `rg '"eventRef":"event_0006"' codex_logs/ai_trace_events.jsonl` 或 `rg '"loopNumber":6' codex_logs/ai_trace_events.jsonl` 精确查。

### Decision 4: schema / prompt / tool catalog 按 hash 去重

导出层建立去重索引：

- `systemPromptRef`
- `toolCatalogRef`
- `toolSchemaRef`
- `toolDescriptionRef`
- `finalizationToolRef`
- `schemaDescriptionRef`

同一 hash 的内容只写一次。后续 model input 只引用 ref 和 hash，不重复写入内容。主报告只显示 catalog 摘要，例如 tools 列表、schema 数量、hash。

### Decision 5: `ai_trace_texts.jsonl` 继续承担长文本和 detail 映射，但 header 必须可直接检索

长文本和完整 detail 继续外置。JSONL header 记录需要足够自描述，至少包含：

- `ref`
- `kind`
- `path`
- `hash`
- `originalLength`
- `preview`
- `visibility`
- `relatedEventRef`
- `relatedModelInputRef`
- `relatedToolName`

chunk 记录继续按 `parentRef` 和 `chunkIndex` 拼接。默认报告不再列出完整 `longTextRefs` 数组，只保存计数、阈值和查询模板。

### Decision 6: 默认报告设置硬性体积预算

导出层应对默认报告设置结构预算，而不是只依赖长文本阈值。建议目标：

- 常规 trace 默认报告控制在约 100-300 行。
- 异常长 trace 默认报告也不得内联完整 snapshot、schema 或 detail。
- 每个 loop timeline 项只保留排障必要字段和 refs。
- 大数组只保留 count、head/tail 摘要和 refs。

如果预算超出，导出层优先继续外置字段，而不是扩大默认报告。

## Risks / Trade-offs

- [Risk] 默认报告过度精简，Codex 首轮无法判断失败边界。→ Mitigation: `traceSummary`、`loopTimeline`、`failureIndex` 和 `responseSummary` 必须保留错误 code、toolName、loop、stepId、token usage 和相关 refs。
- [Risk] 拆分文件后引用断裂。→ Mitigation: 为每类 ref 增加单元测试，验证主报告中的 refs 都能在对应 JSONL 中找到。
- [Risk] schema 去重后不方便确认某一轮工具可用性。→ Mitigation: `model_input` 记录保留该轮 `toolCatalogRef`、toolNames、toolAvailability 和 audit 摘要。
- [Risk] 旧排障脚本依赖 `longTextRefs` 或 `detailRefs` 数组。→ Mitigation: 保留兼容查询说明，并在 `fileManifest` 中提供记录数量；如必须兼容旧入口，可短期保留 compact index，但不得恢复完整内联详情。
- [Risk] 新增 JSONL 文件增加保存 API 复杂度。→ Mitigation: 将导出 payload 先拆成统一 `TraceLogExportBundle`，API 只负责写 manifest 中声明的文件。

## Migration Plan

1. 在导出层引入新的 bundle 结构：`report`、`events`、`modelInputs`、`texts`、`details`、`manifest`。
2. 调整 `createTraceLogPayload` 或等价函数，使默认 `report` 不再包含 `modelVisibleInputSnapshot`、`details`、完整 `longTextRefs` 和重复 schema。
3. 调整保存 API，按 bundle 写入 `ai_trace_log.js`、`ai_trace_events.jsonl`、`ai_trace_model_inputs.jsonl` 和 `ai_trace_texts.jsonl`。
4. 补充测试，覆盖失败 loop、多轮重复 tool 调用、schema 去重、ref 可追溯、敏感字段脱敏和默认报告体积预算。
5. 验证现有「保存用户问答记录」不受影响。

## Open Questions

- 默认报告的硬性预算是否采用行数、字节数，还是二者同时约束。
- 是否需要短期保留 `longTextRefs` / `detailRefs` 的 compact 兼容数组，还是完全转为 JSONL header 查询。
- `ai_trace_texts.jsonl` 是否继续同时保存 long text 和 detail，还是将 detail 拆为 `ai_trace_details.jsonl`。
