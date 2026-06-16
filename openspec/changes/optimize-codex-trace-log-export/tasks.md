## 1. 导出结构建模

- [x] 1.1 梳理当前 `createTraceLogPayload`、`extractTraceLogLongTexts` 和保存 API 的字段流向，标记默认报告中应删除、外置或保留的字段。
- [x] 1.2 定义 `TraceLogExportBundle` 或等价内部结构，拆分 `report`、`events`、`modelInputs`、`texts`、`details` 和 `manifest`。
- [x] 1.3 定义稳定 ref 命名规则，包括 `eventRef`、`modelInputRef`、`contentRef`、`detailRef`、`toolCatalogRef`、`schemaRef` 和 hash 去重键。

## 2. 默认报告瘦身

- [x] 2.1 将 `codex_logs/ai_trace_log.js` 的 payload 调整为索引报告，只保留 `traceSummary`、`loopTimeline`、`failureIndex`、`tokenUsageSummary`、`lookupGuide` 和 `fileManifest`。
- [x] 2.2 从默认报告中移除完整 `modelVisibleInputSnapshot`、完整 Raw trace detail、完整 `details`、完整 `longTextRefs` 和重复 schema / prompt / description 内容。
- [x] 2.3 为异常长 trace 增加默认报告结构预算，超出预算时继续外置字段并保留可追溯 ref。

## 3. JSONL 映射文件

- [x] 3.1 新增或调整 `ai_trace_events.jsonl` 写入逻辑，按事件保存 model call、model response、tool execution、runtime validation、final response projection 和 terminal failure。
- [x] 3.2 新增或调整 `ai_trace_model_inputs.jsonl` 写入逻辑，按模型调用保存模型输入审计摘要、message refs、tool catalog ref、budget 和 toolAvailability。
- [x] 3.3 保留并增强 `ai_trace_texts.jsonl`，确保长文本、detail header、chunk、visibility 和相关 event/model input 元数据可用 `rg` 精确查找。
- [x] 3.4 对 system prompt、tool catalog、tool schema、tool description、schema description 和 finalization schema 做 hash 去重，后续记录只引用 ref。

## 4. 保存 API 与兼容边界

- [x] 4.1 调整 `app/api/dev/ai-traces/route.ts` 的保存逻辑，使其按 bundle manifest 写出默认报告和各 JSONL 映射文件。
- [x] 4.2 保持 `codex_logs/ai_trace_log.js` 作为默认入口文件，并更新其中的查询模板。
- [x] 4.3 确认「保存用户问答记录」仍只追加写入 `codex_logs/prompt.js`，不受全链路 log 格式调整影响。
- [x] 4.4 确认脱敏逻辑覆盖新增 JSONL 记录，不向默认报告或映射文件写入 secret、cookie、authorization、跨用户 payload 或完整 handler output。

## 5. 测试与验证

- [x] 5.1 补充 trace 导出测试，验证默认报告不包含完整 `modelVisibleInputSnapshot`、完整 tool schema、完整 prompt/schema description 或完整 Raw trace detail。
- [x] 5.2 补充 ref 完整性测试，验证主报告中的 `eventRef`、`modelInputRef`、`contentRef`、`detailRef`、`schemaRef` 和 `toolCatalogRef` 都能在对应 JSONL 中找到。
- [x] 5.3 补充多轮重复 tool 调用测试，验证重复 schema/prompt/tool catalog 只保存一次，后续轮次通过 hash/ref 复用。
- [x] 5.4 补充失败 trace 测试，验证 `failureIndex` 能定位最后失败 loop、toolName、errorCode、eventRef、modelInputRef 和 tool result ref。
- [x] 5.5 运行相关自动化测试，并按改动范围运行 `npm test` 或更窄的 trace 导出测试；如涉及类型边界，运行 `npm run typecheck`。
- [x] 5.6 用当前或构造的长 trace 样本保存一次全链路 log，确认默认报告体积明显下降，且 Codex 可通过 `rg` 按 ref 找回必要证据。
