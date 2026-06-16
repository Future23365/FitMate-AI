## Why

当前「保存全链路 log」面向 Codex 排障，但默认报告会内联多轮 `modelVisibleInputSnapshot`、工具 schema 和消息快照，导致 `codex_logs/ai_trace_log.js` 行数和 token 成本过高。这个 change 的目标是把保存格式调整为 Codex 优先读取的低成本索引，同时保留按需追溯完整证据的能力。

## What Changes

- 将默认 `codex_logs/ai_trace_log.js` 调整为因果索引报告，只保留 trace 总览、loop timeline、失败定位、token 汇总、关键 step / tool / model call 摘要和可检索引用。
- 从默认报告中移除每轮完整 `modelVisibleInputSnapshot`、重复 tool schema、重复 prompt/schema description、完整 Raw trace detail 和大对象 preview 的内联输出。
- 新增或调整可按需检索的 JSONL 映射文件，用于保存模型输入快照、事件明细、长文本、detail 和去重后的 prompt/tool/schema 内容。
- 对 system prompt、tool description、tool schema、finalization schema 和重复 tool observation 按 hash 去重，后续轮次只保留 ref / hash / path / usage summary。
- 保留现有 `contentRef` / `detailRef` 查询方式，并补充面向 Codex 的 `modelInputRef`、`eventRef`、`schemaRef` 等稳定引用，便于 `rg` 精确查找。
- 增加导出体积与可读性约束：默认报告应能在常规排障中先读完，完整证据只能通过引用按需展开。
- 不改变 `/api/chat` 生产链路、Agent runtime、模型可见输入、tool handler、业务 tool summary 或用户可见输出。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `ai-trace-debugger`: 调整「保存全链路 log」的导出合同，使其面向 Codex 低 token 排障，同时通过外置 JSONL 和去重引用保留完整可追溯证据。

## Impact

- 影响 `components/dev/ai-trace-viewer.tsx` 中 trace log payload 生成、长文本外置、detailRef/contentRef 组织和导出索引结构。
- 影响 `app/api/dev/ai-traces/route.ts` 中保存 payload 的归一化、文件写入和导出说明。
- 可能新增或调整 `codex_logs/ai_trace_events.jsonl`、`codex_logs/ai_trace_model_inputs.jsonl` 等开发态导出文件；现有 `codex_logs/ai_trace_texts.jsonl` 继续承担长文本映射职责。
- 需要更新与 trace 导出相关的单元测试或集成测试，验证默认报告不再内联重复模型输入快照，同时引用仍可找回完整证据。
