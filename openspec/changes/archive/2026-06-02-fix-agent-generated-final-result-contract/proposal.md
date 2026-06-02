## Why

最新 trace 显示 Agent 已经完成 `searchExercises -> generateRoutineDraft -> validateRoutineDraft -> evaluatePolicy -> saveConversationArtifactRevision`，并拿到 `artifactId`、`revisionId`、`validationId` 和 `policyDecisionId`。但模型最后返回的 `final_result.generated` 仍沿用了 `answered.replyContext` 形态，缺少 `artifact`、`revisionId` 和 `validationId`，导致已保存成功的训练编排被降级为 `model_output_invalid`。

这说明当前 Agent 主链只处理了“保存前提前 final”的恢复，没有处理“保存后 final 少填已登记资源字段”的可恢复契约错误。

## What Changes

- 在 Agent runtime 中识别保存成功后的非法 `final_result.generated`：当当前 run 已有成功的 `saveConversationArtifactRevision` tool result，且模型只缺少可由该 tool result 确定补齐的 `artifact`、`revisionId` 或 `validationId` 时，生成合法的 `AgentExecutionResult.generated`。
- 保持 `AgentExecutionResult.generated` schema 严格，不允许未保存内容或缺少服务端登记资源的结果伪装成成功。
- 强化 Agent final result prompt 和决策提示示例，明确 `generated` 的完整 JSON 形态。
- 增加回归测试覆盖当前 trace：保存成功后模型返回缺字段 `generated` 时，最终结果仍引用已登记保存结果并投影为成功。

## Capabilities

### New Capabilities

### Modified Capabilities
- `conversation-artifact`: Agent 保存 routine / plan artifact 成功后，最终 `generated` 结果必须引用已登记保存资源；若模型省略这些字段，系统应从本轮保存 tool result 中补齐结构化终止合同，而不是丢弃已保存结果。

## Impact

- 影响 `lib/server/agent-orchestrator/runtime.ts` 的 final result 解析失败恢复。
- 影响 `lib/server/chat/chat-service.ts` 和 `lib/server/ai/prompt-config.ts` 的 Agent final result 提示。
- 更新 `tests/agent-orchestrator.test.ts` 覆盖保存后缺字段恢复。
- 需要运行相关自动化测试、`npm run typecheck` 和 `openspec validate fix-agent-generated-final-result-contract --strict`。
