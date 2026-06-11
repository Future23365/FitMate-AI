# Agent Premature Final Result 修复

记录时间：2026-06-02 00:14:21 CST

## 真实问题

最新 trace `trace_mpvehtfh_iizmw4gv` 显示训练编排链路已经完成候选检索、草稿生成、草稿校验和 Policy 评估：

- `searchExercises` 成功返回 routine 候选集合。
- `generateRoutineDraft` 成功返回 `draftId`。
- `validateRoutineDraft` 成功返回 `validationId`。
- `evaluatePolicy` 成功返回 `policyDecisionId`。

但第 5 轮模型没有继续调用 `saveConversationArtifactRevision`，而是提前返回了非法 `final_result.generated`。这个结果缺少 `artifact`、`revisionId` 和 `validationId`，因此被解析为 `model_output_invalid`。更关键的是，模型自己的 reason 也写着“还需调用 saveConversationArtifactRevision 完成保存，应继续保存”，说明这是 Agent 收口决策抖动，不是工具链能力缺失。

## 原方案为什么不合适

旧 runtime 一旦 `parseAgentToolDecision` 失败就直接结束为 `model_output_invalid`。这对 JSON 破损、未知工具等不可恢复错误是合理的，但对当前场景过早：系统已经有 `draftId + validationId + policyDecisionId`，还有剩余 step，只差一次保存工具调用。

如果放宽 `generated` schema，会让未保存的训练草稿伪装成成功生成，这是错误方向。正确做法是保持终止结果严格，同时把“保存前提前 final”作为可恢复决策错误反馈给下一轮模型。

## 调整思路

- `AgentExecutionResult.generated` 继续要求 `artifact`、`revisionId` 和 `validationId`。
- runtime 只在窄条件下恢复：当前 run 已有 draft、validation、policy decision，尚未有 revision，且模型输出的是保存前提前 `final_result.generated` / `patched`。
- 恢复时写入合成的 `agentDecisionFeedback` tool result，包含 `recommendedToolName=saveConversationArtifactRevision` 和推荐输入。
- 下一轮模型能看到该反馈并继续调用保存工具。
- prompt 明确没有成功的保存工具结果和 `revisionId` 时禁止返回 `generated` 或 `patched`。

## 关键改动

- `lib/server/agent-orchestrator/runtime.ts` 新增保存前提前 final 的可恢复反馈分支。
- `lib/server/ai/prompt-config.ts` 强化 final result 收口约束。
- `tests/agent-orchestrator.test.ts` 增加回归测试，覆盖非法提前 `generated` 后继续保存并最终生成成功。

## 结果

这类模型收口抖动不会再直接让用户看到“没有生成或修改训练结果”。系统会把错误反馈给下一轮 Agent 决策，让它继续执行 `saveConversationArtifactRevision`，只有拿到真实 `revisionId` 后才能返回 `generated`。
