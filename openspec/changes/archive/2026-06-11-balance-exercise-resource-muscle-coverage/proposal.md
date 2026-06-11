## Why

当前 `searchExerciseResources` 在多肌群查询时会把 `muscles` 作为 OR 条件后按固定排序截取前几条动作，返回结果可能集中在少数肌群，导致模型为了确认全身覆盖继续多次调用同一查询 tool。

本变更要让该 tool 在保持只读动作事实查询职责的前提下，更适合支撑“新手全身训练计划”等需要多肌群覆盖的场景：返回动作列表应尽量均衡覆盖请求肌群，并明确告诉模型哪些请求肌群在当前过滤条件下确实没有候选。

## What Changes

- 修改 `searchExerciseResources` 的多肌群查询结果组织策略：当输入包含多个 `muscles` 时，服务端内部按请求肌群分别统计和抽样，尽量让 `groups.<section>.exercises[]` 均衡覆盖非 0 命中的请求肌群。
- 在每个 `groups.<section>` 下新增简单字段 `zeroMatchMuscles`，表达该 section 在当前过滤条件下匹配数量为 0 的请求肌群。
- 保持 `groups.<section>.exercises[]`、`query.totalMatches`、`query.returnedCount`、`query.truncated`、`diagnostics` 等既有主结构不变；`totalMatches` 仍表示整体 OR 查询命中数量，不改成各肌群计数求和。
- 同步更新 `searchExerciseResources` 的 output schema、model-visible summary、user projection、trace summary 和 tool-level 单测。
- 不新增服务端自然语言关键词分流，不根据“全身”等用户短语改写 tool call，不修改 LangChain runtime 主循环、provider payload、`/api/chat` 主链路或 production response adapter 主流程。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-exercise-resource-query-tool`: 增强 `searchExerciseResources` 多肌群查询的返回候选覆盖策略和 section 内 0 命中肌群诊断。

## Impact

- 影响代码：
  - `lib/server/langchain-agent/tools/exercise-resource-tools.ts`
  - `lib/server/exercises/exercise-repository.ts`
  - `lib/server/config/agent-runtime-config.ts` 如实现需要集中配置均衡抽样上限或策略默认值
  - `tests/langchain-agent-tools/search-exercise-resources.test.ts`
- 影响合同：
  - `searchExerciseResourcesOutputSchema`
  - `groups.<section>` 模型可见 summary / user projection / trace summary
  - `searchExerciseResources` 的 tool description / schema description 中关于多肌群查询和 `zeroMatchMuscles` 的说明
- 不影响：
  - LangChain runtime 主循环
  - DeepSeek provider tool calling payload
  - `/api/chat` route
  - `submitVisibleTrainingProposal` 终态校验工具
  - 训练计划保存、渲染或持久化结构
