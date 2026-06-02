## Context

`/api/chat` 已固定走 Tool-first `AgentOrchestrator`。当前 routine 编排链路能完成 `searchExercises(candidateUse="routine")` 和 `generateRoutineDraft`，但 `generateRoutineDraft` 的完整输出只存在于服务端 tool execution result 中；下一轮模型输入为了控制 token，只暴露 `draftId`、标题、校验摘要和少量动作 id。

问题出在后续工具契约：`validateRoutineDraft` 要求模型传回完整 `draft`，而模型实际只有 `draftId`。这会在 schema 层失败，使 Agent 退回纯文本 `answered`，跳过 `evaluatePolicy` 和 `saveConversationArtifactRevision`，最终没有 routine artifact 供聊天卡片展示。

## Goals / Non-Goals

**Goals:**
- 让 `generateRoutineDraft` 产出的完整 draft 成为本轮 Agent runtime 的服务端资源。
- 让 `validateRoutineDraft`、`evaluatePolicy` 和 `saveConversationArtifactRevision` 通过资源 id 解析上游 draft / validation / policy 结果。
- 在资源 id 不存在、工具类型不匹配或候选集合不一致时返回结构化失败。
- 增加自动化测试证明 routine 编排不需要模型复写完整 draft payload。

**Non-Goals:**
- 不改变 routine draft 的字段结构、卡片 UI 或保存后的 `WorkoutRoutine` 数据模型。
- 不新增客户端兼容层，也不恢复旧 intent-first / `assistant_action` 推送路径。
- 不让模型根据自然语言 summary 重建可保存训练 payload。

## Decisions

1. 服务端 runtime 保存成功 tool result 的完整 `output`。

   当前 `AgentToolResultRecord` 只保存 `modelSummary` 与 `traceSummary`，适合模型与调试页，但不适合作为后续工具的事实源。新增只在服务端使用的 `output` 字段，让 runtime 内部可以通过 `draftId`、`validationId`、`policyDecisionId` 找回完整结构化结果。

   备选方案是把完整 draft 放入 `modelSummary`。该方案会显著增加 token，并把不该由模型复写的事实 payload 暴露给模型，容易再次产生字段漂移。

2. 后续工具输入从“完整 payload”改为“资源 id + 必要边界字段”。

   `validateRoutineDraft` 应接收 `draftId`、`candidateSetId`、`candidateExerciseIds` 和 `intent`，并从本轮 tool results 中解析完整 routine draft。保存 revision 时同理基于 `draftId`、`validationId`、`policyDecisionId` 读取已验证资源。

   备选方案是在 prompt 中强制模型复制完整 draft。该方案不可靠，且违背 Agent 工具链中“模型选择工具，服务端持有事实”的边界。

3. 资源解析必须保持本轮隔离。

   资源只能从当前 `runId` 的 `state.toolResults` / dependency graph 中解析，不能从 conversationSummary、客户端输入或跨会话缓存恢复。解析失败时返回 retryable 的结构化工具失败，让 Agent 可以修复、阻断或失败，而不是展示未校验卡片。

## Risks / Trade-offs

- [Risk] `AgentToolResultRecord.output` 可能让 trace 或测试 fixture 变大。→ 只在模型输入中继续使用压缩 summary；Response Writer 和测试按需读取完整 output。
- [Risk] 工具解析到不匹配的 `draftId` 或候选集合。→ 校验 `draftKind`、`candidateSetId`、`candidateExerciseIds` 与上游 result 一致，不一致返回 `invalid_dependency`。
- [Risk] 保存工具在缺少 validation / policy 时提前写入 artifact。→ 保存前必须解析并确认 validation 有效、policy 允许或已进入确认边界。
