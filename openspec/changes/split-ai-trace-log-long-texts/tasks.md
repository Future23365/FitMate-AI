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
