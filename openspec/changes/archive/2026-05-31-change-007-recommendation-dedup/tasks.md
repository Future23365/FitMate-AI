## 1. 曝光与排除集合

- [x] 1.1 新增 `ExerciseExposure` 或等价曝光来源，记录聊天卡片、artifact、routine、plan 和 schedule 中已曝光动作。
- [x] 1.2 实现 exclude set builder，聚合当前卡片、当前会话、最近推荐、用户反馈、健康风险和未来计划高频动作。
- [x] 1.3 为每个 excludedExerciseId 记录 excludeReasons。

## 2. 候选不足策略

- [x] 2.1 将 exclude set 接入 Exercise Retrieval Service。
- [x] 2.2 实现候选不足判断，先放宽近期曝光、新鲜度等非关键条件。
- [x] 2.3 确保硬限制不可自动放宽，包括用户明确 dislike、健康风险、器械不可用、section 不合法和候选外动作。
- [x] 2.4 候选仍不足时返回可放宽选项，并等待用户确认。

## 3. RecommendationTrace

- [x] 3.1 新增 RecommendationTrace 类型，记录 goal、filters、excludedExerciseIds、excludeReasons、候选数量、relaxedConstraints、fallbackUsed 和 finalExerciseIds。
- [x] 3.2 将 RecommendationTrace 写入 AiRunTrace 的 tool 或 recommendation step 摘要。
- [x] 3.3 在推荐刷新、Patch 替代和 PlanEngine 动作选择中复用 trace 输出。

## 4. 测试与验证

- [x] 4.1 补充“换一批”不重复推荐测试。
- [x] 4.2 补充 dislike、too_hard、健康风险和当前卡片已有动作的排除测试。
- [x] 4.3 补充候选不足放宽与仍不足提示测试。
- [x] 4.4 补充 RecommendationTrace 字段测试。
- [x] 4.5 运行 `npm test`、`npm run typecheck` 和 `npm run lint`。

## 5. 文档记录

- [x] 5.1 在 `docs/方案变更历史` 新增方案变更记录，说明动作推荐从 prompt 去重升级为服务端排除集合。
- [x] 5.2 如新增曝光记录或推荐 trace 字段，同步更新相关架构文档。
