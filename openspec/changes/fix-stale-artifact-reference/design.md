## Context

当前链路把聊天引用解析和训练计划生成拆成两个请求：`/api/chat` 先解析 `ReferenceResolution`，前端随后调用 `/api/ai/workout-plan` 生成计划草稿。聊天自动保存也会在同一窗口内把消息中的 routine / plan 重新写入 `ConversationArtifact`，当 payload 被判断为变化时会创建新 revision，并把旧 artifact 与旧 index 标记为 `superseded`。

受控 payload 读取当前只接受 `status = active` 的 artifact。这个安全边界是正确的，但当后续请求拿到的是同一 revision 链路上的旧 id 时，会把合法引用误判为 `not_found`，导致 DomainPlanEngine 返回可恢复失败。

## Goals / Non-Goals

**Goals:**

- 允许服务端在当前用户权限范围内，把旧 revision id 解析到同一 artifact 链路的当前 active revision。
- 让 `/api/ai/workout-plan` 基于 resolved routine / plan 引用展开长期计划时使用当前 active payload。
- 保持完整 payload 只能由服务端受控读取，不能把 conversationSummary 或客户端摘要当作 payload 来源。
- trace 能看出原始引用 id 和最终读取 id，方便定位 stale artifact 问题。
- 用单元测试覆盖旧 revision、不可访问 artifact 和长期计划展开。

**Non-Goals:**

- 不修改 Prisma schema 或迁移历史数据。
- 不允许读取 archived artifact 或其他用户 artifact。
- 不把 `ReferenceResolution` 结构改成携带完整 payload。
- 不处理跨设备极端并发写入的分布式锁问题。

## Decisions

1. 在 artifact service 增加专用受控读取能力，而不是在 DomainPlanEngine 内拼查询。

   计划新增 `getActiveArtifactPayloadForCurrentUser()` 或等价函数。它先按原始 id + 当前 user 读取 artifact 基本信息；如果 artifact active，直接校验并返回；如果 artifact superseded，则在当前 user、session、kind 范围内沿 `revisionOfArtifactId` 链路查找当前 active revision。这样权限、状态、payload schema 校验仍集中在 artifact service。

   备选方案是在 `/api/ai/workout-plan` 失败后重新调用 `searchArtifacts`。这个方案会受标题/摘要排序影响，可能解析到同会话中语义相近但不同的训练卡片，因此不采用。

2. revision 解析只在同一 lineage 内进行，不用 conversationSummary 重建。

   active revision 必须满足：同一 `userId`、同一 `sessionId`、同一 `kind`，并且其 `revisionOfArtifactId` 链路能追溯到原始 id。找不到时继续返回 `not_found`，避免把无关 active artifact 当作目标。

   备选方案是允许读取 `superseded` payload。这个方案能避免报错，但会用旧训练内容生成长期计划，和用户当前看到的卡片不一致，因此不采用。

3. `/api/ai/workout-plan` 只消费 artifact service 的结果。

   计划生成服务不直接理解 revision 细节，只接收“当前可用 payload”和可诊断 metadata。trace 的 `tool_call` 记录原始 `referenceResolution`、最终 `artifactId`、是否发生 revision 解析和失败原因。

## Risks / Trade-offs

- [Risk] lineage 查询可能比单次按 id 查询多一次数据库读取。→ Mitigation：只在原始 id 不是 active 时触发，且限制在当前用户、当前会话、当前 kind 范围内。
- [Risk] 历史数据中 revision 链断裂时无法恢复。→ Mitigation：保持原有可恢复失败路径，提示用户重新点明或重新生成。
- [Risk] 自动保存仍可能产生多余 revision。→ Mitigation：本次先保证下游读取稳定；revision churn 可作为后续独立问题继续优化。

## Migration Plan

无需数据库迁移。上线后旧 `superseded` artifact id 会在后续读取时按 lineage 解析到当前 active revision；无法解析的旧数据继续走现有可恢复失败。
