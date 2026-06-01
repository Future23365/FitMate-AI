## Why

最新 `/api/chat` trace 显示，Agent 已正确把“今天想练上肢，30 分钟，有哑铃，帮我安排一套”转换为 `searchExercises(candidateUse="routine", bodyRegions=["upper_body"], equipmentRequired=["dumbbell"])`，但同时传入的 `query="上肢训练"` 被 hybrid search 当成硬召回条件，导致结构化过滤后仍有 109 个候选的情况下最终返回 `no_hybrid_match`。

这会让 routine 生成在第一步候选搜索阶段被错误 blocked，无法进入 `generateRoutineDraft`、validation、Policy 和 artifact 写入。

## What Changes

- 调整 routine / plan 可执行候选搜索规则：当请求已经包含结构化候选边界时，`query` 只能作为排序提示或调试信息，不得把结构化候选集硬清零。
- 保留 answer / recommendation / patch 等搜索的 query 语义召回行为，避免泛化放宽影响动作推荐与动作替换。
- 补充回归测试，覆盖 `candidateUse="routine"`、`bodyRegions=["upper_body"]`、`equipmentRequired=["dumbbell"]` 且 `query="上肢训练"` 的场景。
- 同步记录方案变更，说明这次问题发生在候选检索门控层，不是 draft validation 层。

## Capabilities

### New Capabilities

### Modified Capabilities
- `chat-routine-composition`: routine / plan 编排的动作候选搜索不得因泛化 query 召回未命中而丢弃已通过结构化过滤的候选。

## Impact

- 影响 `lib/server/exercises/exercise-service.ts` 的 hybrid search 召回门控。
- 影响 Agent `searchExercises(candidateUse="routine" | "plan")` 后续生成链路。
- 需要更新 `tests/exercise-service.test.ts`，并按需运行 Agent 编排相关测试、typecheck 和 OpenSpec strict validate。
