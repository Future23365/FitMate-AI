## Why

用户说“换一批”“别再推荐这个”“后面都别安排俯卧撑”时，去重和排除逻辑不能交给 RAG 或 prompt 临场处理。系统需要由服务端统一计算排除集合、候选不足策略和 RecommendationTrace，才能避免重复曝光、偏好失效或候选不足时强行回填。

## What Changes

- 新增推荐排除集合构建器，统一计算当前卡片已有动作、当前会话曝光、最近推荐、用户 dislike、too_hard、健康风险和未来计划高频动作。
- 新增 `ExerciseExposure` 或等价曝光记录，用于追踪动作在聊天卡片和计划中的出现。
- 候选不足时按规则放宽非关键条件，仍不足则向用户说明候选不足并提供可确认的放宽选项。
- 新增 `RecommendationTrace`，记录过滤条件、排除原因、候选数量、放宽条件、fallback 和最终动作。
- 推荐刷新和 Patch 候选共用服务端排除与追踪逻辑。

## Capabilities

### New Capabilities
- `recommendation-dedup`: 定义推荐排除集合、曝光记录、候选不足处理和 RecommendationTrace 要求。

### Modified Capabilities
- `exercise-metadata-pools`: 检索候选需要接收统一 exclude set 和放宽策略。
- `user-feedback-memory`: dislike、too_hard 和临时偏好参与排除集合。

## Impact

- 影响动作推荐、换一批、Patch 替代候选、PlanEngine 候选选择和 AI trace。
- 可能需要新增 `ExerciseExposure` 或基于 artifact/index 派生曝光集合。
- 需要补充推荐刷新不重复、候选不足提示、放宽策略和 RecommendationTrace 测试。
