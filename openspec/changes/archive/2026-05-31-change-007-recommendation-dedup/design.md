## Context

动作推荐需要兼顾新鲜度、用户反馈、风险和可用候选。当前如果只依赖模型“尽量不要重复”，重复推荐和候选不足都不可控。这个 change 把排除集合和候选不足处理下沉到服务端。

## Goals / Non-Goals

**Goals:**

- 统一构建推荐和替代动作的 exclude set。
- 记录动作曝光和排除原因。
- 候选不足时先放宽非关键条件，再明确提示用户。
- 为推荐决策记录 `RecommendationTrace`。

**Non-Goals:**

- 不实现向量检索；相关召回增强属于 `change-008-rag-hybrid-search`。
- 不实现用户记忆写入；依赖 `change-006-user-feedback-memory`。
- 不改变 Policy 和 Confirmation 的写入边界；批量修改确认属于 `change-009-policy-confirmation`。

## Decisions

### Decision 1: 排除集合服务端统一计算

排除集合包括当前卡片已有动作、当前会话已曝光动作、最近 N 次推荐过的动作、用户 dislike、用户 too_hard、健康风险动作和未来计划中大量出现的动作。调用方只传目标和上下文，不自行拼排除列表。

### Decision 2: 排除原因可追踪

每个被排除的 exerciseId 都记录原因，例如 `current_card`、`recent_exposure`、`user_dislike`、`too_hard`、`risk` 或 `future_overuse`。这能解释为什么候选不足，也能帮助调试误排除。

### Decision 3: 候选不足先放宽非关键条件

系统可先放宽近期曝光、新鲜度或弱偏好，但不得默认放宽硬限制，例如用户明确 dislike、健康风险、器械不可用、section 不合法和候选外动作。仍不足时需要告诉用户，而不是强行回填。

### Decision 4: RecommendationTrace 独立于 AiRunTrace

RecommendationTrace 是推荐决策的结构化摘要，可作为 AiRunTrace 的 step output 写入，也可用于单元测试断言过滤和 fallback 行为。

## Risks / Trade-offs

- [Risk] 排除过严降低推荐丰富度。→ Mitigation: 分层放宽，并把放宽条件记录到 trace。
- [Risk] 曝光记录增长较快。→ Mitigation: 查询只读取近期窗口，旧曝光可归档或按 artifact/index 派生。
- [Risk] 用户明确要求重复某动作时被误排除。→ Mitigation: 当前消息优先，可显式解除相关排除但必须记录原因。
