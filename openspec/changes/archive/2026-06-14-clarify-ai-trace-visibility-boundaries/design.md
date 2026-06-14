## Context

当前 LangChain tool wrapper 会为同一次 tool execution 记录多种投影：

- `modelVisibleSummary`：作为 LangChain ToolMessage content 回填给 LLM。
- `userProjection`：供前端或用户可见投影使用，不回填给 LLM。
- `traceSummary`：供开发者排查 trace 使用，不回填给 LLM。

这些字段在 trace record 和导出报告中相邻出现。开发者在阅读 `codex_logs/ai_trace_log.js` 时，可能看到 `traceSummary.totalMatches` 后误以为 `totalMatches` 已经进入模型上下文。当前 `enteredModelContext: true` 也容易被误读为“整个 tool execution record 已进入模型”，而实际语义只是该 execution 的 `modelVisibleSummary` 已经被 LangChain runtime 作为 ToolMessage 消费。

本 change 属于开发态 trace 可读性修复。它不改变模型实际看到的内容、不改变生产 `/api/chat` 输出、不改变 tool schema，也不删除调试字段。

## Goals / Non-Goals

**Goals:**

- 在 `/dev/ai-traces` 页面明确展示 `modelVisibleSummary`、`userProjection`、`traceSummary` 的消费方和可见性边界。
- 在 `codex_logs/ai_trace_log.js` 和 `ai_trace_texts.jsonl` 导出中保留字段级或区块级可见性元数据，使离线排查能判断字段是否 model-visible。
- 将 `traceSummary.totalMatches`、`returnedCount`、`truncated` 等诊断字段标注为 debug-only / not model-visible。
- 澄清 `enteredModelContext`：它只说明 `modelVisibleSummary` 回填给模型，不说明 `userProjection` 或 `traceSummary` 进入模型。
- 保留现有 `contentRef` / `detailRef` 长文本与结构化详情外置机制。

**Non-Goals:**

- 不修改 `toModelVisibleSummary` 的字段集合。
- 不删除 `traceSummary.totalMatches`、`returnedCount`、`truncated` 等诊断字段。
- 不新增或重命名业务 tool input / output schema 字段。
- 不修改 LangChain runtime 主循环、DeepSeek provider payload、production response adapter 主流程或 `/api/chat` route。
- 不新增服务端关键词、正则、同义词或业务 `toolName` 分流。

## Decisions

### 1. 使用显式 visibility 元数据，而不是依赖字段名或位置

页面和导出都应在 tool execution 输出区块上附加稳定可见性标记：

- `llm_visible`：内容会作为 ToolMessage 或等价模型输入回填给 LLM。
- `user_projection`：内容供前端或用户事件消费，不回填给 LLM。
- `debug_only`：内容只供 trace / log / 诊断使用，不回填给 LLM 或用户响应。

每个区块还应有 `modelVisible: true | false` 或等价布尔语义，便于测试和人工排查。字段级诊断如果独立展示，也必须继承或显式声明所在区块的 visibility。

替代方案是只调整标题文案，例如把 `traceSummary` 改成“调试摘要”。该方案成本更低，但离线导出、测试和自动审计仍只能依赖自然语言，不能稳定防止误读。

### 2. 保留 debug-only 指标，不把排查能力当成泄漏处理

`traceSummary.totalMatches`、`returnedCount`、`truncated` 对判断数据库筛选、候选截断和工具执行是否成功有价值。它们的问题不在于存在，而在于缺少“not model-visible”标识。

因此本 change 要求保留这些指标，但在页面和导出里标注为 `debug_only`。如果未来某个字段确实包含敏感或跨用户信息，应按脱敏规则处理，而不是用本 change 的可见性标签替代安全边界。

### 3. 将 `enteredModelContext` 展示为派生语义

现有 execution record 上的 `enteredModelContext: true` 不应在页面或导出摘要中解释为“整个 record 已进入模型”。展示层应改用更精确的文案或派生字段，例如：

- `modelVisibleSummaryEnteredModelContext: true`
- “LLM 已接收：仅 `modelVisibleSummary`”
- “未回填模型：`userProjection`、`traceSummary`”

实现可以先保留底层字段名以避免大范围迁移，但页面和导出报告的可读摘要必须使用精确语义。若后续要重命名底层字段，需要单独处理兼容和 trace 历史样本。

### 4. 不改变模型合同，验证重点放在 trace/export

本 change 不应触碰 `searchExerciseResources.toModelVisibleSummary` 或其他 tool 的模型可见摘要内容。验证应证明：

- LLM 可见摘要中仍不含 `totalMatches`、`returnedCount`、`truncated` 等 debug 指标。
- 导出报告中如果出现这些字段，必须能通过 visibility 元数据判断它们是 debug-only。
- 页面不会把 `userProjection` 或 `traceSummary` 放在 “LLM 可见内容” 区块下。

## Risks / Trade-offs

- [Risk] 增加 visibility 元数据后，trace 报告更长。  
  Mitigation：默认报告只展示区块级标记，字段级标记只用于高风险字段或展开详情。

- [Risk] 底层字段仍叫 `enteredModelContext`，读 Raw JSON 的开发者仍可能误读。  
  Mitigation：页面和轻量导出必须给出精确解释；Raw JSON 保留完整字段但不是默认排查入口。

- [Risk] debug-only 标签被误认为安全脱敏完成。  
  Mitigation：spec 明确 visibility 标签只表达消费方，不替代 secret / cross-user / large payload 脱敏规则。

- [Risk] 只更新页面不更新导出，离线排查仍会误判。  
  Mitigation：本 change 同时修改 `ai-trace-debugger` 和 `ai-run-trace` spec，tasks 要求覆盖页面测试和导出测试。
