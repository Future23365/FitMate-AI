## Why

开发者在排查 LangChain tool 执行时，容易把 `traceSummary.totalMatches`、`userProjection` 等调试字段误认为已经进入模型上下文。当前 trace 导出虽然保留了 `modelVisibleSummary`、`userProjection` 和 `traceSummary`，但可见性边界主要依赖字段位置和人工理解，不足以防止排障结论误判。

本变更需要让 `/dev/ai-traces` 页面和 `codex_logs/ai_trace_log.js` 导出明确标注每类字段的消费方，证明哪些内容是真正回填给 LLM 的 ToolMessage，哪些只是前端投影或 debug-only 摘要。

## What Changes

- 在 trace 页面和导出报告中显式区分 `modelVisibleSummary`、`userProjection`、`traceSummary` 三类 tool execution 输出。
- 为字段或区块增加稳定可见性标记，例如 `llm_visible`、`user_projection`、`debug_only`，并显示 `modelVisible: true/false` 或等价布尔语义。
- 将 `traceSummary.totalMatches`、`returnedCount`、`truncated` 等候选数量诊断标注为 debug-only / not model-visible，避免误读为模型可见事实。
- 澄清 `enteredModelContext` 的展示语义：它只表示该 tool execution 的 `modelVisibleSummary` 已回填给模型，不表示整个 execution record 都进入模型上下文。
- 保持现有调试能力：不删除 `traceSummary.totalMatches` 等诊断字段，不削弱 `contentRef` / `detailRef` 排查链路。
- 不改变 LangChain tool wrapper 的模型可见摘要、不改变业务 tool schema、不改变 `/api/chat` 生产响应合同。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ai-trace-debugger`: `/dev/ai-traces` 页面展示 tool execution 输出时，必须明确标注 LLM 可见、用户投影和 debug-only 边界。
- `ai-run-trace`: `codex_logs/ai_trace_log.js` / `ai_trace_texts.jsonl` 导出必须保留可见性元数据，使离线排查能判断字段是否进入模型上下文。

## Impact

- 影响开发态 trace 页面：`components/dev/ai-trace-viewer.tsx` 或等价 trace viewer 组件。
- 影响 trace 导出：`app/api/dev/ai-traces/route.ts` 或当前保存全链路 log 的导出逻辑。
- 影响相关测试：`tests/ai-trace-viewer.test.ts`、`tests/ai-trace-http.test.ts` 或现有 trace export 测试。
- 不影响生产 `/api/chat` 用户可见响应、LangChain tool schema、`toModelVisibleSummary` 输出内容、数据库查询逻辑或模型调用策略。
