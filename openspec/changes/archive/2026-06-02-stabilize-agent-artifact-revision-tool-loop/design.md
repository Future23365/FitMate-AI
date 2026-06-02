## Context

当前 `/api/chat` 已切到 Tool-first `AgentOrchestrator`。用户请求“这8个动作做成一套训练”时，ContextPackage 的 `recentArtifactSummaries` 已包含目标 `exercise_recommendation` artifact 和 8 个 `exerciseIds`，模型也按契约传入了 `sourceArtifactId` 与 `requiredExerciseIds`。

失败点在服务端工具契约：Agent 的 `getArtifactPayload` 和 artifact-bound `generateRoutineDraft` 仍调用严格 active-only 的 `getArtifactPayload`。当上下文构建时拿到的 artifact id 在同一会话后续保存或 revision 刷新中变成 `superseded`，完整 payload 读取会返回 `Artifact not found or not accessible.`。模型随后重复尝试同一工具与同一 artifact，导致 12 轮 tool decision 累积超过 10 万 token。

已有 `getActiveArtifactPayload` 可以把同一 `userId/sessionId/kind/lineage` 上的旧 artifact id 恢复到 active revision，但 Agent 工具尚未接入该入口。

## Goals / Non-Goals

**Goals:**

- 合法旧 artifact revision 在 Agent 读取和 artifact-bound routine 生成时恢复到 active payload。
- 保持 userId、sessionId、kind、lineage 和 payload schema 校验，不把不可访问 artifact 误恢复。
- 在 trace 中记录 requested/active artifact id 和 revision 恢复状态。
- 对重复失败的工具调用做确定性熔断，阻止同一失败在 tool loop 中反复消耗 token。
- 压缩模型可见的重复失败 tool result 上下文，保留可诊断摘要。

**Non-Goals:**

- 不新增服务端自然语言关键词判断、同义词匹配或用户意图纠偏。
- 不改变 Prisma Schema 或 artifact 生命周期状态模型。
- 不让模型从 `conversationSummary`、聊天正文或 recent summary 反推完整可保存 payload。
- 不绕过 `requiredExerciseIds` 必须来自来源推荐 artifact 的校验。
- 不重写 AgentOrchestrator 的整体循环策略。

## Decisions

### 1. Agent artifact payload 读取使用 active revision 恢复

`getArtifactPayload` Agent 工具改用 `getActiveArtifactPayload`。工具输出保留原本的 `artifactPayloadId`、`artifactId`、`kind` 和 payload 摘要，同时增加 `requestedArtifactId`、`activeArtifactId` 与 `revisionResolution.status`。如果请求 id 本身就是 active，状态为 `direct`；如果恢复到 active revision，状态为 `resolved_to_active`。

选择这个方案，是因为 revision 恢复属于确定性数据库事实：同一用户、同一 session、同一 kind、同一 lineage 的 active revision 是当前可执行事实源。相比让模型拿 recent summary 重建 payload，这个方案保留服务端权限、schema 和持久化边界。

### 2. artifact-bound routine 校验复用同一恢复入口

`generateRoutineDraft` 的 `resolveRoutineRequiredExerciseBoundary` 同样使用 active revision 读取来源 artifact。`requiredExerciseIds` 仍必须存在于 active payload 的推荐动作集合中；恢复只改变读取到哪一个 revision，不改变动作来源校验。

这比允许模型省略 `sourceArtifactId` 更稳，因为用户明确要求“这 8 个动作”时，服务端仍能证明 routine 来源于推荐 artifact，而不是裸搜出来的候选集合。

### 3. 重复失败工具调用由 runtime 熔断

Agent runtime 在执行工具前计算稳定的 tool attempt key：`toolName + normalizedInput`。当同一 key 已经产生不可通过重试修复的失败码，例如 `not_found`、`forbidden`、`invalid_dependency`、`schema_validation_failed`，后续相同调用不再重新执行底层工具，而是返回 `duplicate_tool_failure` 或等价失败结果，并引用原始失败 `toolResultId`。

这个边界放在 runtime，而不是 prompt，因为重复失败是结构化执行事实，服务端可以确定性判断；prompt 只能降低概率，不能保证不重复。

### 4. 模型可见 tool result 摘要压缩重复失败

模型下一轮上下文继续看到失败事实，但相同失败只保留一条摘要，带 `repeatCount`、`firstToolResultId`、`latestToolResultId` 和 failure code。这样模型知道该路径已经失败，不需要完整重复 payload。

该压缩只影响模型可见上下文，不删除 trace 原始步骤；调试页仍能看到每次决策和熔断原因。

### 5. Trace 明确记录恢复和熔断

tool trace 增加 revision 恢复字段和重复失败熔断字段。成功恢复时记录 requested/active id；失败熔断时记录 duplicate key、first failure id 和 repeat count。trace 不记录额外未授权 payload。

## Risks / Trade-offs

- [Risk] lineage 判断错误可能把用户不想要的 active revision 当成目标。→ Mitigation: 恢复必须限定同 `userId/sessionId/kind`，并使用 `revisionOfArtifactId` 祖先链判断，不按标题、summary 或自然语言相似度恢复。
- [Risk] active revision payload 与旧 summary 的动作集合不同。→ Mitigation: `requiredExerciseIds` 覆盖校验仍在 active payload 上执行；如果 active revision 不包含 required id，返回结构化 `invalid_dependency`，不自由生成。
- [Risk] 熔断可能阻止某些可修复失败重试。→ Mitigation: 只对同一 normalized input 的不可重试失败熔断；unknown facet、schema repair 后不同输入、候选重新查询等仍可继续执行。
- [Risk] 压缩失败摘要降低模型可见细节。→ Mitigation: 模型只需要知道失败路径、失败码和可用替代路径；完整细节保留在 trace Raw JSON。

## Migration Plan

1. 更新 Agent read/generate 工具使用 active revision 读取入口，并补充输出摘要。
2. 在 Agent runtime 增加本轮工具失败索引和重复失败熔断。
3. 更新模型可见 tool result 构造，压缩重复失败摘要。
4. 更新 trace 记录与测试，覆盖 stale artifact 恢复、artifact-bound routine 成功和重复失败熔断。
5. 运行相关单测、typecheck，并用保存的 trace 场景做静态/自动化回归。

## Open Questions

无。当前问题可以由确定性服务端契约处理，不需要新增语义判断或用户确认。
