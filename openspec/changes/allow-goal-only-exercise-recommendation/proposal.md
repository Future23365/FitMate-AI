## Why

当用户只表达“我想练腿”这类明确部位的动作推荐意图时，系统已经能从动作库筛出足够候选，但当前意图 gating 会因为缺少器械或场地而跳过 `assistant_action`，导致前端无法推送动作推荐。

需要把纯动作推荐的触发条件从单次训练编排中拆开：动作推荐只要求目标或部位明确且候选可用；器械、场地、时长只作为筛选优化信息，不应阻断推荐。

## What Changes

- 调整 `exercise_recommendation` 的触发规则：目标或部位明确且动作候选不是 `insufficient` 时，服务端 SHALL 触发 `exercise_recommendation` 内部动作事件。
- 保留 `routine` 和 `workout_plan` 的严格 gating：仍需要满足对应编排或计划生成所需的关键字段。
- 收敛意图解析提示词，明确 `equipmentOrLocation` 不能阻断纯动作推荐。
- 增加覆盖“我想练腿”这类目标明确但缺少器械/场地的单元测试。

## Capabilities

### New Capabilities
- `chat-exercise-recommendation-trigger`: 定义聊天中纯动作推荐的触发条件，以及它与单次训练编排触发条件的边界。

### Modified Capabilities

## Impact

- `lib/server/chat/chat-service.ts`
- `lib/server/ai/prompt-config.ts`
- `tests/chat-service.test.ts`
- OpenSpec change 文档与新规格
