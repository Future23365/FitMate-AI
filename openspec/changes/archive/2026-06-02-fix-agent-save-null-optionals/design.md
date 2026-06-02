## Context

Agent 的保存链路已经切换为资源 id 驱动：`generateRoutineDraft` 输出完整 draft 并登记 `draftId`，`validateRoutineDraft` 和 `evaluatePolicy` 只引用资源 id，`saveConversationArtifactRevision` 再通过 `draftId` 从服务端 tool result 解析真实 payload。模型不应该复写完整 payload。

最新 trace 中这个链路已经走到 `policyDecisionId`，但保存工具输入包含 `sourceArtifactId: null`、`payload: null`、`patchId: null`、`responseMessageId: null`。这些字段在业务语义上都表示“不适用”，但当前 Zod schema 只接受字段缺省，导致保存工具在执行依赖解析前失败。

## Goals / Non-Goals

**Goals:**
- 对保存工具的可选字段接受 `null` absence，并在服务端解析阶段等价为 `undefined`。
- 保持 draft / patch / validation / policy 的 hard boundary，不让 `null` 绕过必需资源校验。
- 明确首次 routine / plan 保存时只需要 `artifactKind`、`candidateSetId`、`validationId`、`policyDecisionId`、`draftId`、`validationPassed`、`policyAllowed`，payload 由服务端 draft 解析。
- 用真实工具执行测试覆盖 trace 中的失败形态。

**Non-Goals:**
- 不改变 `ConversationArtifact` 数据模型或持久化结构。
- 不允许模型直接持久化未经校验的 `payload`。
- 不改变 PolicyEngine、Validator 或 ConfirmationGate 的行为。
- 不新增服务端自然语言语义判断。

## Decisions

1. 只在保存工具输入 schema 层把 optional `null` 归一化为缺省。

   这样可以处理 LLM 常见的 JSON absence 表达，同时仍保留 Zod schema 作为第一道结构边界。字段归一化只覆盖本工具已有的可选字段：`sourceArtifactId`、`artifactKind`、`payload`、`confirmationId`、`draftId`、`patchId`、`responseMessageId`。

2. `payload: null` 不参与持久化。

   当输入同时有 `draftId` 和 `payload: null` 时，服务端仍从已登记 draft 解析 payload。当没有 `draftId` 且 `payload` 为 `null` 时，归一化后等价于缺少 payload，现有 refine 必须继续失败。

3. Prompt 只补执行合同，不增加语义纠偏规则。

   提示词只说明保存工具应如何引用已登记资源，不根据用户原文推断或改写 action。

## Risks / Trade-offs

- [Risk] 接受 `null` 可能掩盖模型输出不严谨。→ 只对 optional absence 字段做归一化，必填字段和业务依赖仍严格校验。
- [Risk] 模型继续传多余字段。→ Zod object 的现有行为会忽略未知字段；真正写入仍来自服务端已校验资源。
- [Risk] trace 仍可能在后续 Response Writer 阶段失败。→ 本 change 只覆盖当前保存 schema 失败；通过端到端 agent-orchestrator 测试降低回归风险。
