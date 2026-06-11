# LangChain tool schema repair 与动作可用性字段收回

记录时间：2026-06-11 17:47:13 CST

## 背景问题

LangChain tool wrapper 在 input schema 校验失败时，返回给模型的 tool message 只有宽泛的 `tool_schema_invalid` 信息。模型能看到失败，但看不到具体哪个字段、期望类型和实际输入，因此会反复修错同一个参数。

同时，`searchExerciseResources` 把 `published` 暴露为模型可传字段，并在 query summary、filter application 和 repository hard filter 中继续作为 Planner input 处理。这个字段不属于用户意图，也不需要模型手动控制；动作库查询应默认面向当前可用动作事实。

## 调整思路

1. 在通用 LangChain tool wrapper 层生成脱敏字段级 `issues[]`，并把它写入模型可见失败 tool message 和 trace schema issues。
2. 从 `searchExerciseResources` 的 input schema、description、成功 output query、`appliedFilters`、`filterApplications` 和 repository search input 中移除 `published`。
3. 保留服务端 schema 校验、数据库 where 下推、section-aware hard filter policy 和最终结构化校验边界，不新增用户原文关键词、phrasing 或具体业务 toolName 分流。

## 关键改动

- `executeLangChainToolWrapper` 的 input schema 失败 message 现在包含 `issues[]`，每项只暴露 `path`、`code`、`message`、`expected`、`actual`、`keys`、`options` 等稳定字段。
- `searchExerciseResources` 不再要求或接受 `published`，旧字段会被 `.strict()` schema 作为未知字段拒绝，并返回字段级 repair payload。
- 动作查询 repository 不再从 Planner input 读取 `published`，也不再把它作为 search hard filter 或 applied filter 暴露。
- production tool catalog 和 tool-level tests 覆盖 `published` 不再出现在 search tool 的模型输入合同中。

## 验证方式

- `npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts tests/exercise-repository.test.ts`
- `npm run typecheck`
- `openspec validate fix-langchain-tool-schema-repair-and-exercise-visibility --strict`
