# Agent Save Null Optional 修复

记录时间：2026-06-02 00:03:01 CST

## 真实问题

最新 trace `trace_mpve0zd8_cxort1c4` 显示训练编排链路已经推进到保存前：

- `searchExercises` 成功返回 routine 候选集合。
- `generateRoutineDraft` 首次因 intent 字段不合规失败，但 Agent 自动修复后成功生成 `draftId`。
- `validateRoutineDraft` 成功返回 `validationId`。
- `evaluatePolicy` 成功返回 `policyDecisionId`。
- `saveConversationArtifactRevision` 连续两次因 Schema 校验失败，最终返回 blocked。

保存失败的关键输入是模型把不适用的可选字段传成了 `null`，例如 `sourceArtifactId: null`、`payload: null`、`patchId: null` 和 `responseMessageId: null`。这些字段语义上表示“不适用”，但旧 schema 只接受字段省略，不接受 `null`。

## 原方案为什么不合适

之前的资源合同要求模型只传 `draftId`、`validationId`、`policyDecisionId`，由服务端解析完整 payload。这个方向是正确的，但保存工具没有容错 LLM 常见的 JSON absence 表达：模型在尝试表达“首次创建，没有 sourceArtifactId；payload 由 draftId 提供”时输出了 `null`，导致 schema 在执行资源解析前失败。

如果简单要求模型不要传 `null`，仍然会把同类 LLM 输出抖动暴露给用户。更稳的边界应该是：服务端把 optional absence 的 `null` 归一为缺省，但继续严格校验必需资源。

## 调整思路

- `saveConversationArtifactRevision` 的可选 absence 字段接受 `null` 并归一为 `undefined`。
- `payload: null` 不参与持久化；当有 `draftId` 时，payload 仍从服务端已登记 draft 读取。
- 没有 `draftId` / `patchId`、没有有效 payload、首次创建缺少 `artifactKind` 等 hard boundary 继续失败。
- Agent prompt 明确首次 routine / plan 保存时不要提交 `payload:null`、`sourceArtifactId:null`、`patchId:null` 等空值字段。

## 关键改动

- `lib/server/agent-orchestrator/workout-tools.ts` 新增 optional 字段 `null -> undefined` 归一化。
- `lib/server/ai/prompt-config.ts` 补充保存工具调用约束。
- `tests/agent-orchestrator.test.ts` 覆盖 trace 中的 null optional 保存输入，并验证没有 draft/payload 时仍失败。

## 结果

首次 routine / plan 生成链路在 `evaluatePolicy` 成功后，不会再因为可选字段为 `null` 被保存工具 schema 阻断。真正的写入 payload 仍来自服务端已校验 draft，未放宽 AI 直接写入 payload 的安全边界。
