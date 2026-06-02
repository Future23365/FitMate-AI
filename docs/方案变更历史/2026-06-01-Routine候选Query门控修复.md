# 2026-06-01 23:41:41 CST Routine 候选 Query 门控修复

## 当前真实问题

最新 trace 中，“今天想练上肢，30 分钟，有哑铃，帮我安排一套”已经被 Agent 正确转换为 `searchExercises(candidateUse="routine")`，并传入 `bodyRegions=["upper_body"]`、`equipmentRequired=["dumbbell"]`、`allowedSections=["warmup","training","stretch"]` 等结构化边界。

但模型同时传了 `query="上肢训练"`。动作搜索在 hard filters 后仍有 109 个候选，却继续要求该 query 在单个动作的全文或向量召回中命中。由于“上肢训练”是泛化范围词，不是动作库真实 facet，最终所有候选被 hybrid gate 清空，返回 `no_hybrid_match`，Agent 因此 blocked，没有进入 `generateRoutineDraft`。

## 调整思路

routine / plan 的可执行候选集应以结构化字段为事实来源。`bodyRegions`、`equipmentRequired`、`allowedSections`、`sessionMinutes` 已经表达了用户要的训练范围和执行边界，此时 `query` 只能作为辅助排序或调试信息，不能反过来把结构化候选硬清零。

本次没有新增服务端自然语言纠偏，也没有读取用户原文改写语义；服务端只根据模型已经给出的结构化 `candidateUse` 和候选边界决定 query 是否作为硬召回门。

## 关键改动

- `ExerciseSearchInput` 显式加入 `candidateUse`。
- `searchExercisesInMemory` 对 `candidateUse="routine"` / `candidateUse="plan"` 且存在结构化边界的请求，不再要求 query hybrid score 大于 0 才保留候选。
- `recommendation`、`answer_only`、`patch` 搜索继续保留原 query 召回行为。
- 补充回归测试覆盖 `query="上肢训练"`、`bodyRegions=["upper_body"]`、`equipmentRequired=["dumbbell"]` 的 routine 搜索。

## 验证结果

- `npm test -- tests/exercise-service.test.ts`：1 个测试文件、12 个测试通过。
- `npm test -- tests/exercise-service.test.ts tests/agent-orchestrator.test.ts tests/chat-service.test.ts`：3 个测试文件、55 个测试通过。
- `npm run typecheck`：通过。
- `openspec validate fix-routine-search-query-gating --strict`：通过。
