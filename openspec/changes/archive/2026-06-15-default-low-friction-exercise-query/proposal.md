## Why

宽泛动作推荐在用户未说明器械或场地时，Planner 目前可能先查询无执行场景约束的候选，再根据混杂结果补查 `executionProfile = "no_equipment"`，导致同一推荐目标消耗多次 `searchExerciseResources` 调用。需要把“低门槛无器械”作为当前请求的稳定保守默认，让模型第一次动作查询就使用正确的高层执行口径。

## What Changes

- 调整生产 LangChain Agent 默认 prompt：宽泛动作推荐、动作筛选或结构化训练候选请求缺少器械 / 场地 / 可用设施偏好时，默认按低门槛无器械口径继续。
- 明确该默认口径对应 `executionProfile = "no_equipment"`：允许地面或瑜伽垫，不假设椅子、墙面、台阶、搭档、户外空间或健身房固定设施。
- 调整 `searchExerciseResources` 的模型可见 tool description / schema description，让 `executionProfile` 的输入来源表达上述默认，并区分 `no_equipment` 与 `home_support` 的使用条件。
- 增加 prompt / tool catalog / search tool 相关回归测试，覆盖第一次查询即使用 `executionProfile = "no_equipment"` 的合同。
- 不新增服务端自然语言分流、关键词规则、phrasing 特判、provider `tool_calls` 改写、LangChain runtime 循环策略或 `/api/chat` 主链路改动。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 默认 prompt 需要表达宽泛动作推荐缺少执行条件时的低门槛无器械默认口径。
- `agent-exercise-resource-query-tool`: `searchExerciseResources` 的模型可见说明需要表达 `executionProfile = "no_equipment"` 是宽泛动作推荐缺少器械 / 场地偏好时的默认高层执行口径，并区分 `home_support` 只在用户明确可用常见居家支撑时使用。

## Impact

- 影响代码：
  - `lib/server/langchain-agent/prompt.ts`
  - `lib/server/langchain-agent/tools/exercise-resource-tools.ts`
  - `tests/langchain-agent-tools/production-tool-catalog.test.ts`
  - `tests/langchain-agent-tools/search-exercise-resources.test.ts`
- 影响模型可见合同：
  - 默认 LangChain Agent system prompt 的 Planner policy。
  - `searchExerciseResources.executionProfile` 的 schema description 和 tool description。
- 不影响：
  - `searchExerciseResources` handler、repository、execution taxonomy adapter 或数据库查询能力。
  - LangChain runtime、tool wrapper、provider payload、response adapter、terminal failure finalizer 或 `/api/chat` 主链路。
  - `visibleTrainingProposal` validator 和渲染合同。
