## Why

当前 LangChain tool input 校验失败时，wrapper 只把泛化 `tool_schema_invalid` 消息传回模型，导致模型看不到具体字段路径、期望值和实际值，无法做局部修正。与此同时，`searchExerciseResources` 把 `published` 这类服务端动作可用性边界暴露为模型可传 input，模型在 native tool calling 中把 `true` 传成字符串后反复失败并耗尽预算。

## What Changes

- 增强 LangChain tool wrapper 的模型可见 schema 失败反馈：只暴露脱敏后的字段级 repair facts，不暴露 stack trace、内部路径、完整 schema 或 handler payload。
- 从 `searchExerciseResources` 的模型可见 input schema、description、examples、query summary 和 filter application 中移除 `published`。
- 将动作查询的可用性边界收回服务端执行合同：模型只能表达动作事实筛选条件，不能通过 `published` 控制动作可见性或发布态过滤。
- 更新相关 tool-level、runtime wrapper 和 production catalog 测试，覆盖字段级 repair payload 与 `published` 字段移除。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `langchain-agent-runtime`: tool input schema 失败时，模型可见 tool message 必须包含消毒后的字段级 repair facts。
- `agent-exercise-resource-query-tool`: `searchExerciseResources` 不再暴露或接受模型传入的 `published` 字段，查询摘要也不再把 `published` 作为模型可见查询条件。

## Impact

- 影响 `lib/server/langchain-agent/tool-wrapper.ts` 的 schema 失败模型可见 payload。
- 影响 `lib/server/langchain-agent/tools/exercise-resource-tools.ts`、`lib/server/exercises/exercise-resource-filter-policy.ts` 和 `lib/server/exercises/exercise-repository.ts` 中 `published` 相关查询合同。
- 影响 `tests/langchain-agent-runtime/runtime.test.ts`、`tests/langchain-agent-tools/search-exercise-resources.test.ts` 和 `tests/langchain-agent-tools/production-tool-catalog.test.ts`。
- 不修改 `/api/chat` 主链路，不新增服务端关键词、正则、同义词或具体 phrasing 分流。
