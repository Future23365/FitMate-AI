## 背景

当前 `/dev/ai-traces` 保存全链路 log 时，前端通过 `createTraceLogPayload()` 生成包含 `agentLoops`、`moduleGroups`、`plannerModelCalls`、`runtimeTraceEvents`、`responseSummary`、`rawTrace` 和 `trace` 的大对象，后端 `normalizeSavedLogPayload("trace", payload)` 统一脱敏后写入 `codex_logs/ai_trace_log.js`。

这个方式保留了足够多的诊断字段，但长文本与结构化摘要混在同一个文件中。默认排查时只需要 loop、step、tool、error code、token usage 和 response summary；只有在模型行为异常、schema 失败、JSON 解析失败、prompt 合同缺失时，才需要读取完整长文本。

## 设计方向

本 change 采用「轻量报告 + 映射文件」：

1. 前端仍由 `createTraceLogPayload()` 构造可保存 payload，但在 payload 内把长字符串抽离成 `longTextRefs` 和 `longTexts`。
2. `ai_trace_log.js` 只写轻量报告对象。报告内的长文本字段替换为引用对象：
   ```json
   {
     "contentRef": "text_0001",
     "path": "$.plannerModelCalls[0].request.messages[0].content",
     "kind": "model_request_message",
     "originalLength": 18500,
     "hash": "sha256:...",
     "preview": "..."
   }
   ```
3. `ai_trace_texts.jsonl` 写入对应长文本映射。超长内容不写成单行巨型 JSON，而是写成 header + chunk records：
   ```json
   {"recordType":"text","contentRef":"text_0001","path":"$.plannerModelCalls[0].request.messages[0].content","chunkCount":3}
   {"recordType":"text_chunk","parentRef":"text_0001","chunkIndex":0,"content":"..."}
   ```
4. 报告不内联完整 `rawTrace` 或完整 `trace` 对象，只保留 `traceSummary` 和 step summary。
5. 报告中的 `traceSummary` 和 `runtimeTraceEvents` 使用 `detailRef` 指向映射文件中的完整脱敏结构化详情；`runtimeTraceEvents` 在报告内只保留 event type、step、toolName、toolResultId、code、status、durationMs 和 resource refs 等定位字段，不保留完整 tool manifest 或完整 step input/output。
6. 长文本映射按 hash 去重；同一段 prompt 或 observation 多次出现时只保存一条内容，并记录出现路径。
7. 模型请求 trace 中的长 message content 使用分块 envelope 保存，导出层识别后合并为单条长文本映射，避免在进入导出层前被 adapter 的 800 字符摘要丢失尾部。
8. 映射文件中的详情记录也使用 header + chunk records；报告里被瘦身掉的结构化详情必须能通过 `detailRef` 找回。
9. 两个文件每次保存都覆盖旧内容，不生成目录，也不保留历史版本。
10. 两个文件头部都写注释，说明默认先读报告；`contentRef` / `detailRef` 用于查询 header，`parentRef` 用于查询 chunk 内容。

## 范围与边界

### 任务分类

这是 trace debugger 导出格式变更，不是新增业务 tool，不是 Agent core contract 变更，也不是 `/api/chat` production 接入变更。

### 允许触碰模块

- `components/dev/ai-trace-viewer.tsx`
- `app/api/dev/ai-traces/route.ts`
- `lib/server/agent-planners/model-adapters/model-adapter.ts`
- `lib/server/agent-planners/model-adapters/deepseek-model-adapter.ts`
- `tests/ai-trace-viewer.test.ts`
- `tests/ai-trace-http.test.ts`
- `tests/agent-core/adapter-llm-planner.test.ts`
- 本 change 的 OpenSpec 文档

### 禁止触碰模块

- `runAgentRuntime()` 和 Executor 主循环
- `PlannerPort`
- `ToolRegistry` 注册与 manifest 合同
- `Policy Guard`
- `ResourceStore`
- `Resource Contract Validator`
- `Response Renderer`
- `/api/chat` 主 route 或聊天 production chain
- 服务端关键词、正则、同义词或自然语言模板路由
- Prisma Schema 或数据库迁移

### Core contract 变更

不涉及 core contract 变更。长文本抽离发生在开发态 trace 诊断和保存导出层，不改变模型实际输入、PlannerPort、Agent runtime、tool observation 或用户可见 NDJSON。`DeepSeekModelAdapter` 只改变 request trace 中长 message content 的诊断表示，真实发送给模型的 request body 保持不变。

## 长文本识别规则

默认只抽离字符串，不抽离对象本身。抽离阈值应固定且足够低，保证报告文件轻量；建议为 600 字符左右，与文本聊天 trace 摘要预算一致。

抽离时保留：

- `contentRef`
- `path`
- `kind`
- `originalLength`
- `hash`
- `preview`

`kind` 通过字段路径推断为调试分类，例如：

- `model_request_message`
- `model_response_text`
- `trace_step_input`
- `trace_step_output`
- `trace_step_metadata`
- `trace_step_error`
- `generic_long_text`

该分类只用于调试检索，不参与业务逻辑，也不得影响 Agent 执行。

## 模型请求长文本保真规则

`DeepSeekModelAdapter` 原本在 `createRequestTrace()` 中对 `requestBody.messages[].content` 直接调用 `summarizeText()`，超过 800 字符就变成摘要字符串。这样即使导出层支持长文本映射，`ai_trace_texts.jsonl` 也只能拿到已经被截断的文本。

修正后：

- 真实模型请求 body 不变，仍由 `createRequestBody()` 生成并发送给 DeepSeek。
- request trace 中短 message content 仍保存为脱敏字符串摘要。
- request trace 中超过 adapter 摘要阈值的 message content MUST 保存为 `kind="trace_long_text"` 的分块 envelope。
- 每个 chunk 字符串 MUST 小于 `AiTraceStore` 的单字符串截断阈值，避免 store 把 chunk 变成 preview。
- envelope MUST 记录 `originalLength`、`storedLength`、`chunkSize`、`hash`、`preview`、`redacted` 和 `chunks`。
- 导出层 MUST 识别该 envelope，按 `chunk.index` 合并 `chunks[].text`，作为一条长文本写入 `ai_trace_texts.jsonl`。
- 默认报告 MUST 只保留该长文本的 `contentRef`，不能把 chunks 或完整 content 留在 `ai_trace_log.js`。

如果 chunk 命中敏感值规则，对应 chunk 保存 `[redacted]`；`originalLength` 仍记录模型请求原始长度，便于判断是否发生脱敏。

## 报告瘦身规则

默认报告用于快速排查，不是 Raw trace 归档：

- MUST NOT 保留完整 `rawTrace` 或完整 `trace`。
- MUST 使用 `traceSummary` 记录 trace id、run id、route、status、step count、finalDecision、step 摘要和 `detailRef`。
- MUST 使用轻量 `runtimeTraceEvents`，只保留定位需要的 code、id、状态、tool、resource、token、耗时和 `detailRef`。
- SHOULD 保留模型调用诊断的 request / response 摘要，但长文本必须通过 `contentRef` 外置。
- 被默认报告移除的完整 `trace`、完整 runtime event `input` / `output` / `metadata` / `error` MUST 写入映射文件，并通过报告里的 `detailRef` 找回。

## 结构化详情映射规则

`detailRef` 用于保存“不是长字符串，但默认报告不该内联”的完整结构化诊断：

- `full_trace`：保存当前 trace 的完整脱敏对象，用于恢复 `rawTrace` / `trace` 级别上下文。
- `runtime_event_detail`：保存每条轻量 `runtimeTraceEvents` 对应 step 的完整 `input`、`output`、`metadata` 和 `error`。
- 报告中每个 `detailRef` MUST 包含 `detailRef`、`path`、`kind`、`hash`、`summary` 和 `detailFile`。
- 映射文件中每个详情 MUST 先写 header record，再写按 `chunkIndex` 排序的 `detail_chunk` records；chunk records MUST 使用 `parentRef` 指向对应 `detailRef`。
- 如果详情内部仍包含长字符串，导出层 SHOULD 继续把该字符串替换成 `contentRef`，避免 detail chunk 与 text chunk 重复保存大段内容。

## 脱敏策略

后端仍对 trace 报告和长文本映射执行 `redactJsonValue()`。为了避免长文本在后端二次截断，长文本映射文件应允许比报告更大的字符串预算；但敏感 key、敏感 value、完整 `payload`、`handler`、`database`、`tool_output` 等仍必须脱敏。

如果长文本命中敏感值规则，保存 `[redacted]`，而不是原文。

## 文件格式

`codex_logs/ai_trace_log.js`：

- CommonJS 格式，继续支持 `module.exports = ...`。
- 文件头部说明：
  - 这是轻量报告。
  - 长文本被移到 `codex_logs/ai_trace_texts.jsonl`。
  - 可用 `rg '"contentRef":"text_0001"' codex_logs/ai_trace_texts.jsonl` 查 header。
  - 可用 `rg '"parentRef":"text_0001"' codex_logs/ai_trace_texts.jsonl` 查 chunk 内容。

`codex_logs/ai_trace_texts.jsonl`：

- 前几行使用 `//` 注释，说明用途和查询方式。
- 后续每行一个 JSON object，但一个逻辑内容可以拆成多条记录：
  - `recordType="text"`：长文本 header。
  - `recordType="text_chunk"`：长文本分块，使用 `parentRef` 指向 header。
  - `recordType="detail"`：结构化详情 header。
  - `recordType="detail_chunk"`：结构化详情分块，使用 `parentRef` 指向 header。
- 单个 chunk 的 `content` SHOULD 控制在较小长度，避免 `rg` 命中时一次打印超大行。
- 每次保存覆盖旧文件。

## 验证计划

- `openspec validate split-ai-trace-log-long-texts --strict`
- `npm test -- tests/ai-trace-viewer.test.ts tests/ai-trace-http.test.ts tests/agent-core/adapter-llm-planner.test.ts`
- `npm run typecheck`

## 剩余风险

- 如果某些短文本低于阈值，仍会留在报告中；后端脱敏继续兜底。
- 如果开发者只看报告不查 `contentRef`，可能仍无法判断长 prompt 尾部细节；文件注释和引用字段会明确引导查询方式。
- 如果单次模型输入超过开发态 trace store 的整体序列化预算，仍可能触发 store 级保护；当前修复覆盖常见 30 多轮对话这种数万字符级模型输入。
