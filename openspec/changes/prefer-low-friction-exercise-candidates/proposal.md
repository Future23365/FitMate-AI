## Why

当前 `searchExerciseResources` 在宽泛动作推荐场景下返回的是按通用 `name_asc` 排序的候选事实，容易让主肌群仅为辅助命中的动作排在目标肌群主练动作前面，也会让模型为了获得“更适合直接推荐”的低门槛候选继续补查器械或场地条件。用户在未说明器械时更需要先看到几个可执行动作，再通过后续对话补充器械、场地或偏好。

## What Changes

- 调整 `searchExerciseResources` 的宽泛候选查询默认口径：当输入没有 `equipment`，且不是点名动作名称查询、不是 `requiredExerciseIds` 锚点查询时，repository SHALL 使用现有无外部器械兼容筛选条件作为内部低门槛候选默认，而不是要求 Planner 额外补一次 `equipment = "no_equipment"`。
- 内部低门槛默认必须复用既有无外部器械兼容映射，例如映射到自重或等价无外部器械数据库字段；不得严格只匹配单一 `no_equipment` 字面值，也不得自动附加 `homeRequirement`。
- 调整肌群候选排序：当输入包含 `muscles` 时，返回候选 SHALL 优先展示请求肌群作为 `primaryMuscles` / `primaryMusclesZh` 命中的动作，再展示仅在 `secondaryMuscles` / `secondaryMusclesZh` 命中的动作；多个肌群按输入顺序作为优先级，原 `sort` 仅作为同优先级下的稳定排序。
- 保留点名动作和受控动作 id 查询的召回优先级：`exerciseNames`、`requiredExerciseIds` 不得因为默认低门槛口径或肌群排序被过滤、挤占或降级。
- 模型可见 observation 仍只暴露候选动作事实和显式查询输入事实；内部低门槛默认不得反向变成模型可复制的 `query.equipment` 或新的 tool input 字段。
- 不新增服务端关键词规则、自然语言模板路由、phrasing 特判、具体业务 `toolName` runtime 分支、LangChain runtime 主循环改动或 `/api/chat` 主链路改动。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-exercise-resource-query-tool`: 调整 `searchExerciseResources` 的宽泛候选默认筛选口径、肌群优先排序和模型可见查询摘要边界。

## Impact

- 影响代码：
  - `lib/server/langchain-agent/tools/exercise-resource-tools.ts`
  - `lib/server/exercises/exercise-repository.ts`
  - `lib/server/exercises/exercise-resource-filter-policy.ts` 或等价查询策略 helper
  - `tests/langchain-agent-tools/search-exercise-resources.test.ts`
  - `tests/langchain-agent-tools/production-tool-catalog.test.ts`
  - `tests/langchain-agent-tools/model-visible-contract-gate.test.ts`
- 不影响代码：
  - LangChain runtime 主循环
  - model factory provider payload
  - production response adapter 主流程
  - `/api/chat` 主链路
  - `submitVisibleTrainingProposal` 的最终数据库动作事实校验
- 需要更新 OpenSpec specs，并运行 `openspec validate prefer-low-friction-exercise-candidates --strict`、相关 tool 单测、catalog / contract gate 测试和 `npm run typecheck`。
