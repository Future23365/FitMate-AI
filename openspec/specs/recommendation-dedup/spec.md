# recommendation-dedup Specification

## Purpose
TBD - created by archiving change change-007-recommendation-dedup. Update Purpose after archive.
## Requirements
### Requirement: 推荐必须使用服务端排除集合
系统 SHALL 由服务端统一计算动作推荐和替代候选的排除集合。

#### Scenario: 用户要求换一批
- **WHEN** 用户要求刷新当前动作推荐
- **THEN** 系统 MUST 排除当前卡片已有动作
- **AND** 系统 SHOULD 排除当前会话已曝光动作和最近 N 次推荐过的动作
- **AND** 系统 MUST 记录每个被排除动作的原因

#### Scenario: 用户存在长期 dislike
- **WHEN** 用户对某个动作有 active dislike 反馈
- **THEN** 系统 MUST 默认排除该动作
- **AND** 除非当前消息明确要求重新尝试，否则系统 MUST NOT 将其作为常规推荐结果

### Requirement: 候选不足必须可解释
系统 SHALL 在候选不足时返回结构化原因和可放宽选项，而不是强行回填不合规动作。

#### Scenario: 严格过滤后候选不足
- **WHEN** 严格排除集合导致候选数量不足
- **THEN** 系统 MAY 放宽近期曝光、新鲜度或弱偏好条件
- **AND** 系统 MUST 记录被放宽的 constraints
- **AND** 系统 MUST NOT 自动放宽健康风险、器械不可用、section 不合法或用户明确 dislike

#### Scenario: 放宽后仍候选不足
- **WHEN** 放宽非关键条件后仍没有足够候选
- **THEN** 系统 MUST 向用户说明候选不足原因
- **AND** 系统 MUST 提供可确认的放宽选项
- **AND** 系统 MUST NOT 编造 exerciseId 或重复使用被硬排除的动作

### Requirement: 推荐决策必须记录 RecommendationTrace
系统 SHALL 为推荐刷新、替代动作和计划动作选择记录可复盘的推荐 trace。

#### Scenario: 推荐返回动作集合
- **WHEN** 系统完成一次动作推荐或替代候选选择
- **THEN** RecommendationTrace MUST 记录 goal、filters、excludedExerciseIds、excludeReasons、候选过滤前后数量和 finalExerciseIds
- **AND** 如果使用放宽或 fallback，trace MUST 记录 relaxedConstraints 和 fallbackUsed

#### Scenario: 推荐 trace 写入 AI trace
- **WHEN** 当前请求存在 AiRunTrace
- **THEN** RecommendationTrace SHOULD 作为相关 step 的 output 摘要写入
- **AND** trace MUST 遵守字段长度和隐私边界

