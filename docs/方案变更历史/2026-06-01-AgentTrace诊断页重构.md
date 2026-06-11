# 2026-06-01 18:19:35 CST Agent Trace 诊断页重构

## 问题

`/dev/ai-traces` 已能看到 Agent context、tool decision、tool result 和 final result，但页面默认排查路径仍沿用旧 intent-first 流程。开发者需要在阶段列表和 Raw JSON 之间手动拼出工具序列、资源 id、最终结果和用户可见回复，排查“为什么没有推卡”“为什么没保存 revision”“Response Writer 是否承诺了未执行写入”等问题成本过高。

## 调整思路

把原始 `AiTrace` 到页面展示的转换提取为 `AgentTraceViewModel`。页面不再直接在 JSX 中堆 Agent step 条件，而是消费稳定的 run summary、phase groups、tool timeline、resource links、diagnostic findings 和 legacy compatibility。资源关联只扫描白名单结构化 id 字段，不根据用户文本或 step 标题推断语义。

## 关键改动

- 新增 `components/dev/agent-trace-view-model.ts`，统一构建 Agent run 总览、阶段流、工具时间线、资源关联和失败聚合。
- 新增 Agent trace fixture，覆盖成功 Agent trace、缺失 tool result、缺失 decision、orphaned resource 和 legacy trace fallback。
- 改造 `components/dev/ai-trace-viewer.tsx`，在详情顶部默认展示 Agent run 诊断区，并保留旧流程、Raw JSON、阶段 log、单 step log 和用户问答记录保存。
- 保存全链路 log 时，在原始 trace 与 stages 外追加 Agent 诊断摘要；用户问答记录仍保持窄格式，只保留问题和最终文本回答。
- 单 step 展开时补充 ContextPackage、Agent tool decision/result、AgentExecutionResult 和 Agent Response Writer 的字段解释。

## 验证

- `npm run test -- tests/ai-trace-viewer.test.ts`
- `npm run typecheck`
- `openspec validate refactor-agent-trace-log-page --strict`
