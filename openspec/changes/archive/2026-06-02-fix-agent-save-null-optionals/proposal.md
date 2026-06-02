## Why

最新 trace 显示 Agent 已经完成 `searchExercises -> generateRoutineDraft -> validateRoutineDraft -> evaluatePolicy`，但在 `saveConversationArtifactRevision` 连续两次因为 Schema 校验失败而无法生成 routine 卡片。失败输入的共同点是模型把不适用的可选字段显式传成 `null`，例如 `sourceArtifactId: null`、`payload: null`、`patchId: null` 和 `responseMessageId: null`。

当前保存工具只接受“省略可选字段”，不接受 `null` 表达 absence，导致已通过校验和 Policy 的训练草稿无法进入持久化。

## What Changes

- 调整 `saveConversationArtifactRevision` 的输入合同：对明确表示 absence 的可选字段，允许 `null` 并在服务端解析为未提供。
- 保持 hard boundary 不变：没有 `draftId` / `patchId`、首次创建缺少 `artifactKind`、无 draft 时缺少 payload、Policy 不允许写入等情况仍必须失败。
- 补充 Agent tool decision prompt，明确首次 routine / plan 保存时不得提交 `payload: null`，应通过 `draftId` 由服务端解析 payload。
- 增加回归测试，覆盖首次 routine 保存输入包含 optional null 时仍能通过工具 schema，并继续使用已登记 draft payload。

## Capabilities

### New Capabilities

### Modified Capabilities
- `conversation-artifact`: Agent artifact 保存工具必须把可选字段的 `null` absence 与非法缺失区分开，避免阻断已通过 Validator 和 Policy 的新 artifact 保存。

## Impact

- 影响 `lib/server/agent-orchestrator/workout-tools.ts` 的保存工具输入 Schema。
- 影响 `lib/server/ai/prompt-config.ts` 的 Agent 工具决策提示。
- 需要更新 `tests/agent-orchestrator.test.ts`，并运行 Agent / chat 相关测试、`npm run typecheck` 和 OpenSpec strict validate。
