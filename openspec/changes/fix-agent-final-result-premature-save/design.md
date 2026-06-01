## Context

Agent 终止结果由 `AgentExecutionResult` schema 约束。`generated` / `patched` 必须引用已登记的 `revisionId`、`validationId`、artifact summary 和相关 tool result。最新 trace 中，模型在 Policy 通过后提前返回了 `final_result.generated`，但没有保存 revision，也没有可引用的 `revisionId`。

当前 runtime 一旦 `parseAgentToolDecision` 失败就立即结束为 `model_output_invalid`。这对 JSON 破损、未知 action 等不可恢复错误是合理的，但对“模型自己承认还需保存，且当前上下文已经具备保存所需资源”的错误过于早停。

## Goals / Non-Goals

**Goals:**
- 对保存前的提前 `final_result.generated` 做一次可恢复处理，让下一轮模型继续调用 `saveConversationArtifactRevision`。
- 保持 `AgentExecutionResult.generated` schema 严格，不允许未保存内容伪装成生成成功。
- 在 trace / tool result 中保留该非法决策的错误信息，便于排查。
- 用测试覆盖“非法提前 final -> 保存 -> 合法 generated”的完整链路。

**Non-Goals:**
- 不自动替模型调用保存工具；下一步仍由 Agent 决策器基于错误反馈选择工具。
- 不放宽 `generated`、`patched` 或保存工具的 Schema。
- 不改变 PolicyEngine、Validator、ConversationArtifact 持久化结构。

## Decisions

1. 在 parse failure 分支做可恢复判定。

   当原始决策看起来是 `final_result`，解析失败涉及 `result.artifact` / `result.revisionId` / `result.validationId` 这类 generated 必需字段，并且当前 state 中已有 draft、validation、policy decision 但没有 revision 时，将错误记录为合成 tool result，继续下一轮。

2. 合成结果使用 `agent_tool_decision_feedback` 作为 toolName。

   这不是模型可调用工具，而是 runtime 写入 `state.toolResults` 的反馈记录。它包含错误码、错误消息、建议下一步和当前可用资源 id。下一轮 decision input 会把它作为已登记 tool result 暴露给模型。

3. 仍保留最终失败兜底。

   如果没有剩余 step，或上下文不满足可保存条件，或同类错误重复到 step limit，runtime 仍会以 `model_output_invalid` / `step_limit_exceeded` 结束。

## Risks / Trade-offs

- [Risk] 模型下一轮仍可能不调用保存工具。→ 合成反馈会明确暴露 `recommendedToolName` 和所需资源；step limit 仍是最终兜底。
- [Risk] 合成 tool result 影响引用校验。→ 它只作为错误反馈，不带 `revisionId`，不能让 final result 通过生成成功校验。
- [Risk] 恢复条件误判。→ 只在已有 draft、validation、policy 且缺 revision 的窄场景启用。
