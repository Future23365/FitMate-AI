## Why

最新 trace 显示 Agent 已经完成 `searchExercises -> generateRoutineDraft -> validateRoutineDraft -> evaluatePolicy`，但在仍有剩余 step 且尚未调用 `saveConversationArtifactRevision` 时，模型提前返回了非法 `final_result.generated`。该结果缺少 `artifact`、`revisionId` 和 `validationId`，最终被解析为 `model_output_invalid`，导致已校验通过的训练编排没有保存和展示。

这说明当前 Agent runtime 对“提前终止但仍可继续执行”的模型错误缺少恢复机制。

## What Changes

- 在 Agent runtime 中识别可恢复的非法 `final_result`：当模型输出 schema 不合法、但当前 run 已具备 `draftId + validationId + policyDecisionId` 且尚未生成 `revisionId` 时，不直接结束为 `model_output_invalid`。
- 将该非法终止决策记录为本轮可见的合成失败结果，使下一轮模型能看到必须继续调用 `saveConversationArtifactRevision`。
- 强化 Agent final result prompt：没有成功的 `saveConversationArtifactRevision` / `revisionId` 时，禁止返回 `generated` 或 `patched`。
- 增加回归测试覆盖当前 trace：非法提前 `generated` 后，下一轮应继续调用保存工具并最终返回合法 `generated`。

## Capabilities

### New Capabilities

### Modified Capabilities
- `conversation-artifact`: Agent 在保存 routine / plan artifact 前不得以 `generated` 终止；可恢复的提前终止错误必须继续推进保存工具链。

## Impact

- 影响 `lib/server/agent-orchestrator/runtime.ts` 的 Agent loop 错误恢复。
- 影响 `lib/server/ai/prompt-config.ts` 的 final result 提示。
- 需要更新 `tests/agent-orchestrator.test.ts`，并运行 Agent / chat 相关测试、`npm run typecheck` 和 OpenSpec strict validate。
