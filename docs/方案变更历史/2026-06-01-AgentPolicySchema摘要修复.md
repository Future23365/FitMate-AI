# Agent Policy Schema 摘要修复

记录时间：2026-06-01 23:49:47 CST

## 真实问题

最新 AI trace 中，Agent 已经完成 `searchExercises -> generateRoutineDraft -> validateRoutineDraft`，但随后连续三次调用 `evaluatePolicy` 都失败：

- 第一次只传了 `policyTarget="new_artifact"`，缺少 `artifactKind` 和 `draftId`。
- 第二次补了 `draftId`，但仍缺少 `artifactKind`，还传入了不属于该工具输入合同的 `validationId`。
- 第三次直接传 `{}`，模型理由是看到的 schema 没有必填输入。

这说明问题不在 routine draft 生成和校验，而在 Agent decision 模型看到的工具输入契约已经被瘦身丢失。

## 原方案为什么不合适

`evaluatePolicy` 的 Zod schema 是 discriminated union，转换成 JSON Schema 后根级是 `oneOf`。旧的 `summarizeJsonSchemaFields` 只读取根级 `properties`，因此对 `evaluatePolicy` 生成了空 `inputFields`。

模型看不到 `new_artifact` 分支的 `policyTarget` 判别值，也看不到 `artifactKind`、`draftId` 是必填字段，所以失败后只能盲目自修，最终把工具调用越修越错。

## 调整思路

保持模型输入瘦身，但把 union schema 的分支边界保留下来：

- 根级存在 `oneOf` / `anyOf` 时，按变体输出 `variant + fields` 摘要。
- 字段摘要保留 `const`，让 `policyTarget="new_artifact"` 这类判别值对模型可见。
- 普通 object schema 继续沿用原来的字段摘要，不回退发送完整 schema。
- Agent prompt 明确首次生成 routine / plan 时 `evaluatePolicy` 必须传 `policyTarget`、`artifactKind` 和 `draftId`。

## 关键改动

- `lib/server/chat/chat-service.ts` 支持 union 工具 schema 摘要，并保留字段 `const`。
- `lib/server/ai/prompt-config.ts` 补充首次创建 artifact 的 `evaluatePolicy` 调用形态。
- `tests/chat-service.test.ts` 增加 `evaluatePolicy` union schema 回归测试，证明瘦身后仍包含 `new_artifact`、`artifactKind` 和 `draftId`。

## 结果

模型不再会把 `evaluatePolicy` 误认为无输入工具。首次生成 routine / plan 的链路可以在 `validateRoutineDraft` 成功后继续进入 `evaluatePolicy -> saveConversationArtifactRevision`，而不是停在 schema validation failed。
