## 1. 候选搜索合同

- [x] 1.1 在 `ExerciseSearchInput` 中显式加入 `candidateUse`，用于区分 routine / plan 与 recommendation / answer / patch 搜索。
- [x] 1.2 调整 `searchExercisesInMemory` 的 query 召回门控：routine / plan 且存在结构化边界时，query 不再作为硬过滤条件。
- [x] 1.3 保持 recommendation / answer_only / patch 的 query 召回行为不变。

## 2. 验证与文档

- [x] 2.1 增加回归测试覆盖 `candidateUse="routine"`、`bodyRegions=["upper_body"]`、`equipmentRequired=["dumbbell"]`、`query="上肢训练"` 返回候选。
- [x] 2.2 增加或保留测试证明 recommendation 带 query 的搜索不受 routine / plan 放宽规则影响。
- [x] 2.3 更新方案变更历史和项目演变历程，记录这次修复发生在候选检索门控层。
- [x] 2.4 运行相关自动化检查，至少包括 exercise service 测试、Agent 编排相关测试、`npm run typecheck` 和 `openspec validate fix-routine-search-query-gating --strict`。
