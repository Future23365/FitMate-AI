## 1. 前置确认

- [x] 1.1 复核 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认本 change 是 trace debugger 导出格式变更，不触碰 Agent core、production route 或业务 tool。
- [x] 1.2 复核 `openspec/specs/ai-trace-debugger/spec.md` 和现有导出代码，确认当前保存全链路 log 混合了结构摘要、Raw trace 和长文本。
- [x] 1.3 运行 `git status --short`，确认实现前工作区干净或可隔离无关改动。

## 2. OpenSpec 合同

- [x] 2.1 新增 `split-ai-trace-log-long-texts` proposal、design、tasks 和 `ai-trace-debugger` spec delta。
- [x] 2.2 运行 `openspec validate split-ai-trace-log-long-texts --strict`。

## 3. 导出 payload 结构

- [x] 3.1 在 `components/dev/ai-trace-viewer.tsx` 中新增稳定的长文本抽离 helper，把超过阈值的字符串替换为 `contentRef` 引用。
- [x] 3.2 让 `createTraceLogPayload()` 返回轻量报告和长文本映射，保留 agent loops、module groups、planner model calls、runtime trace events、response summary、token usage 和 Raw trace 摘要。
- [x] 3.3 为长文本引用记录 `contentRef`、`path`、`kind`、`originalLength`、`hash` 和 `preview`。

## 4. 保存接口

- [x] 4.1 在 `app/api/dev/ai-traces/route.ts` 中让 `logType="trace"` 同时覆盖写入 `codex_logs/ai_trace_log.js` 和 `codex_logs/ai_trace_texts.jsonl`。
- [x] 4.2 给两个导出文件增加中文注释，说明默认读报告和按 `contentRef` 查询长文本的方式。
- [x] 4.3 确保 `logType="prompt"` 仍只追加写入 `codex_logs/prompt.js`，不写长文本映射。
- [x] 4.4 继续对报告和长文本映射执行脱敏，避免 API key、authorization、cookie、完整敏感 payload、完整 tool output 或跨用户 payload 泄漏。

## 5. 测试与验证

- [x] 5.1 更新 `tests/ai-trace-viewer.test.ts`，覆盖长文本被抽离为 `contentRef`，报告保留摘要字段，长文本映射保留 path/hash/preview/content。
- [x] 5.2 更新 `tests/ai-trace-http.test.ts`，覆盖保存全链路 log 会覆盖写入 `ai_trace_log.js` 和 `ai_trace_texts.jsonl`，文件注释包含查询指引，敏感字段被脱敏。
- [x] 5.3 覆盖保存用户问答记录仍只追加 `prompt.js`，不写 `ai_trace_texts.jsonl`。
- [x] 5.4 运行 `npm test -- tests/ai-trace-viewer.test.ts tests/ai-trace-http.test.ts`。
- [x] 5.5 运行 `npm run typecheck`。
- [x] 5.6 运行 `git status --short` 和 diff 检查，确认只包含本 change 相关文件。

## 6. 默认报告瘦身修复

- [x] 6.1 移除默认报告中的完整 `rawTrace` 和完整 `trace`，改为 `traceSummary` 和 step summary。
- [x] 6.2 将 `runtimeTraceEvents` 改为轻量摘要，避免完整 manifest、step input/output 和 metadata 重新撑大报告。
- [x] 6.3 让长文本映射按 hash 去重，并记录重复文本出现路径。
- [x] 6.4 更新测试覆盖默认报告不包含完整 Raw trace，重复长文本只保存一次。

## 7. 模型请求长文本保真修复

- [x] 7.1 在 `DeepSeekModelAdapter` 的 request trace 中把超过 adapter 摘要阈值的 message content 保存为分块 envelope，而不是 800 字符摘要。
- [x] 7.2 在 `extractTraceLogLongTexts()` 中识别 `trace_long_text` envelope，按 chunk 合并成一条 `contentRef` 长文本映射，并确保默认报告不保留 chunks。
- [x] 7.3 更新 `tests/agent-core/adapter-llm-planner.test.ts`，覆盖长模型请求 message 的 trace chunks 可拼回真实 request body。
- [x] 7.4 更新 `tests/ai-trace-viewer.test.ts`，覆盖导出层合并 chunk envelope 到 `ai_trace_texts.jsonl` 映射。
- [x] 7.5 运行 `openspec validate split-ai-trace-log-long-texts --strict`。
- [x] 7.6 运行 `npm test -- tests/ai-trace-viewer.test.ts tests/ai-trace-http.test.ts tests/agent-core/adapter-llm-planner.test.ts`。
- [x] 7.7 运行 `npm run typecheck`。
- [x] 7.8 运行 `git status --short` 和 diff 检查，确认只包含本 change 相关文件。

## 8. 结构化详情外置与 JSONL 分块修复

- [x] 8.1 在 `createTraceLogPayload()` 中为完整 trace 和 runtime event step detail 生成 `detailRef` / `details` 映射，默认报告只保留轻量摘要和引用。
- [x] 8.2 在保存接口中把 `details` 从默认报告移除，并写入 `ai_trace_texts.jsonl` 的 `detail` / `detail_chunk` records。
- [x] 8.3 将长文本映射输出改为 `text` / `text_chunk` records，避免超长 content 挤在单条 JSONL 行上。
- [x] 8.4 更新 `tests/ai-trace-viewer.test.ts`，覆盖被摘要的 runtime event 详情可通过 `detailRef` 找回，详情内部长文本继续外置为 `contentRef`。
- [x] 8.5 更新 `tests/ai-trace-http.test.ts`，覆盖映射文件同时保存 text/detail chunks、可重组内容、且单行长度受控。
- [x] 8.6 运行 `openspec validate split-ai-trace-log-long-texts --strict`。
- [x] 8.7 运行 `npm test -- tests/ai-trace-viewer.test.ts tests/ai-trace-http.test.ts tests/agent-core/adapter-llm-planner.test.ts`。
- [x] 8.8 运行 `npm run typecheck`。
- [x] 8.9 运行 `git status --short` 和 diff 检查，确认只包含本 change 相关文件。

## 9. 映射文件审查修复

- [x] 9.1 将 `text_chunk` / `detail_chunk` 的关联字段改为 `parentRef`，避免按 `contentRef` / `detailRef` 查询 header 时直接打印所有 chunk 内容。
- [x] 9.2 移除保存接口对长文本和详情字符串的 80k 二次硬截断，依赖脱敏和 chunk records 控制可读性。
- [x] 9.3 同步更新导出注释、OpenSpec 和演变文档，说明 header ref 与 `parentRef` 的查询方式。
- [x] 9.4 更新 `tests/ai-trace-http.test.ts`，覆盖 header ref 只命中一行、chunk 用 `parentRef` 查询、超过 80k 的文本不被 `...[truncated]` 截断。
- [x] 9.5 运行 `openspec validate split-ai-trace-log-long-texts --strict`。
- [x] 9.6 运行 `npm test -- tests/ai-trace-viewer.test.ts tests/ai-trace-http.test.ts tests/agent-core/adapter-llm-planner.test.ts`。
- [x] 9.7 运行 `npm run typecheck`。
- [x] 9.8 运行 `git status --short` 和 diff 检查，确认只包含本 change 相关文件。
