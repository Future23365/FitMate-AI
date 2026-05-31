## Context

聊天页面已经能推送动作推荐、单次 routine 和长期 plan 卡片，但这些卡片的结构化 payload 目前没有统一成为后续 AI 可用的事实源。`conversationSummary` 适合保存自然语言摘要，不适合保存完整动作、section、训练日和保存状态。第一步需要建立 artifact 层，让“被用户看到过的训练对象”有稳定 id、版本和索引。

## Goals / Non-Goals

**Goals:**

- 将成功推送给用户的结构化训练卡片保存为 `ConversationArtifact`。
- 为 artifact 生成轻量 `ArtifactIndex`，支持后续引用解析和检索排序。
- 保留 artifact 与 chat message、saved routine、saved schedule 的关系。
- 用版本和状态表达修订关系，避免覆盖历史卡片。
- 明确 `conversationSummary` 不承担完整训练事实源职责。

**Non-Goals:**

- 不在本 change 实现引用解析、Patch 修改或复杂 RAG。
- 不迁移所有旧聊天历史卡片；旧消息可以缺少 artifact。
- 不实现向量检索服务；本阶段先保留可扩展字段和基础文本索引。
- 不改变现有 routine、schedule、session result 的事实表职责。

## Decisions

### Decision 1: Artifact 与训练事实表分层

`ConversationArtifact` 保存“用户在对话中看到过的结构化结果”，`WorkoutRoutine` / `WorkoutSchedule` 继续保存已落库、可执行的训练事实。artifact 可以指向已保存实体，但不替代它们。

这样做比直接复用 routine / schedule 更清晰：动作推荐卡片和未保存草稿也需要被引用，而它们还不是可执行事实表。

### Decision 2: payload 使用 schema version 管理

artifact 保存 `payloadSchemaVersion` 和 `payload`，允许 exercise recommendation、routine、plan 使用不同 payload 结构。服务层负责按 `kind` 和版本解析，不让调用方直接把 JSON 当成无类型对象使用。

替代方案是为每种卡片建独立表。当前阶段卡片类型仍在快速演进，统一 artifact 表加受控 payload 更适合先建立引用闭环。

### Decision 3: ArtifactIndex 独立于 payload

`ArtifactIndex` 保存 title、summary、exerciseIds、muscles、equipment、goal、sessionMinutes 等检索字段。引用解析只读 index 列表，需要完整结构时再通过 artifact service 读取 payload。

这样可以降低上下文预算和查询复杂度，也避免后续为了搜索反复解析大 JSON。

### Decision 4: 修订创建新版本

artifact 被修改时创建新 artifact version，并将旧版本标记为 `superseded`。历史消息仍能指向旧版本，后续引用解析优先 active 版本。

覆盖更新更省事，但会让用户看到的旧卡片与后续 AI 读取事实不一致，不利于复盘和 trace。

## Risks / Trade-offs

- [Risk] artifact payload 与现有卡片结构重复。→ Mitigation: 通过转换函数集中生成 artifact payload，避免前端、API 和 artifact 服务各自拼结构。
- [Risk] 新增表后保存链路变长。→ Mitigation: artifact 创建失败应被 trace 记录，并按产品策略决定是否阻断卡片展示；实现时需要明确失败边界。
- [Risk] 历史消息没有 artifact。→ Mitigation: ReferenceResolver v1 对旧消息返回 `not_found` 或进入新生成流程，不做隐式猜测。
- [Risk] payload 版本升级后解析混乱。→ Mitigation: schema version 必须在读取入口做显式分发和校验。
