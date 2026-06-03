## 背景

当前 `/dev/ai-traces` 保存全链路 log 时，前端通过 `createTraceLogPayload()` 生成包含 `agentLoops`、`moduleGroups`、`plannerModelCalls`、`runtimeTraceEvents`、`responseSummary`、`rawTrace` 和 `trace` 的大对象，后端 `normalizeSavedLogPayload("trace", payload)` 统一脱敏后写入 `codex_logs/ai_trace_log.js`。

这个方式保留了足够多的诊断字段，但长文本与结构化摘要混在同一个文件中。默认排查时只需要 loop、step、tool、error code、token usage 和 response summary；只有在模型行为异常、schema 失败、JSON 解析失败、prompt 合同缺失时，才需要读取完整长文本。

## 设计方向

本 change 采用「轻量报告 + 长文本映射」：

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
3. `ai_trace_texts.jsonl` 写入对应长文本映射，一行一个 JSON 记录：
   ```json
   {"contentRef":"text_0001","path":"$.plannerModelCalls[0].request.messages[0].content","kind":"model_request_message","content":"..."}
   ```
4. 两个文件每次保存都覆盖旧内容，不生成目录，也不保留历史版本。
5. 两个文件头部都写注释，说明默认先读报告；需要长文本时用 `contentRef` 到 `ai_trace_texts.jsonl` 查询。

## 范围与边界

### 任务分类

这是 trace debugger 导出格式变更，不是新增业务 tool，不是 Agent core contract 变更，也不是 `/api/chat` production 接入变更。

### 允许触碰模块

- `components/dev/ai-trace-viewer.tsx`
- `app/api/dev/ai-traces/route.ts`
- `tests/ai-trace-viewer.test.ts`
- `tests/ai-trace-http.test.ts`
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

不涉及 core contract 变更。长文本抽离发生在开发态保存导出层，不改变模型实际输入、runtime traceEvents、tool observation、用户可见 NDJSON 或 trace store 写入行为。

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

## 脱敏策略

后端仍对 trace 报告和长文本映射执行 `redactJsonValue()`。为了避免长文本在后端二次截断，长文本映射文件应允许比报告更大的字符串预算；但敏感 key、敏感 value、完整 `payload`、`handler`、`database`、`tool_output` 等仍必须脱敏。

如果长文本命中敏感值规则，保存 `[redacted]`，而不是原文。

## 文件格式

`codex_logs/ai_trace_log.js`：

- CommonJS 格式，继续支持 `module.exports = ...`。
- 文件头部说明：
  - 这是轻量报告。
  - 长文本被移到 `codex_logs/ai_trace_texts.jsonl`。
  - 可用 `rg '"contentRef":"text_0001"' codex_logs/ai_trace_texts.jsonl` 查找。

`codex_logs/ai_trace_texts.jsonl`：

- 前几行使用 `//` 注释，说明用途和查询方式。
- 后续每行一个 JSON object。
- 每次保存覆盖旧文件。

## 验证计划

- `openspec validate split-ai-trace-log-long-texts --strict`
- `npm test -- tests/ai-trace-viewer.test.ts tests/ai-trace-http.test.ts`
- `npm run typecheck`

## 剩余风险

- 如果某些短文本低于阈值，仍会留在报告中；后端脱敏继续兜底。
- 如果开发者只看报告不查 `contentRef`，可能仍无法判断长 prompt 尾部细节；文件注释和引用字段会明确引导查询方式。
