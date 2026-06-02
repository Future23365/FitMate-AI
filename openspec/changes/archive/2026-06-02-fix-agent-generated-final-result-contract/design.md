## Context

`AgentExecutionResult.generated` 是 `/api/chat` 生产执行合同的一部分，必须包含 `artifact`、`revisionId`、`validationId` 和相关 tool result 引用。保存工具 `saveConversationArtifactRevision` 已经返回这些服务端事实，Response Writer 也只能消费这个结构化结果。

当前 runtime 已有一层恢复：如果模型在保存前提前返回非法 `generated`，系统会记录合成反馈并让下一轮继续保存。但最新 trace 的错误发生在保存之后：`saveConversationArtifactRevision` 成功后，模型最后输出 `generated + replyContext`，没有把已登记的保存资源复制到 final result，导致 parse failure 后直接落到 `model_output_invalid`。

## Goals / Non-Goals

**Goals:**
- 保存成功后，针对缺少 `artifact`、`revisionId` 或 `validationId` 的 `final_result.generated` 做窄范围恢复。
- 恢复结果必须完全来自本轮成功的保存 tool result 和模型已声明的 `usedToolResultIds`。
- 保持 final result schema、引用校验和 Response Writer 边界严格。
- 用测试覆盖保存成功后缺字段 final 的真实失败形态。

**Non-Goals:**
- 不放宽 `AgentExecutionResult.generated` 或 `patched` schema。
- 不让 Response Writer 重新解释用户语义或推断是否保存成功。
- 不根据用户自然语言改写模型语义状态。
- 不改变 `ConversationArtifact` 数据模型或持久化结构。

## Decisions

1. 在 parse failure 分支增加保存后恢复。

   当原始决策是 `final_result.generated`、解析失败属于 `result.artifact` / `result.revisionId` / `result.validationId` 缺失，并且当前 state 中存在成功的 `saveConversationArtifactRevision` tool result 时，runtime 构造合法 `AgentExecutionResult.generated`。

2. 补齐字段只来自已登记保存结果。

   `artifact.artifactId`、`artifact.revisionId`、`artifact.kind`、`artifact.title`、`artifact.summary`、`revisionId`、`validationId` 和 `policyDecisionId` 只能来自保存 tool result。`usedToolResultIds` 优先保留模型输出中的 id；如果模型没给，则至少引用保存 tool result。

3. 恢复后仍走引用校验和统一 finalization。

   构造出的 final result 继续通过 `validateFinalResultReferences`，再进入 `finishWithResult`。如果引用不属于当前 run，仍按 `model_output_invalid` 失败。

4. Prompt 给出完整 generated 示例。

   `agent_final_result` 模块和 `createAgentDecisionProvider` 的系统消息都明确展示 `generated` 的完整结构，降低模型继续返回 `replyContext` 形态的概率。

## Risks / Trade-offs

- [Risk] 模型返回的 `usedToolResultIds` 缺失。→ 恢复时至少引用保存 tool result，保证最终结果可追踪到写入事实。
- [Risk] 保存 tool result 缺少 title 或 artifactKind。→ 不恢复，继续按 `model_output_invalid` 失败，避免伪造 artifact summary。
- [Risk] 恢复逻辑扩大到语义改写。→ 只处理 `generated` 结构字段缺失，不改变模型选择的状态，也不读取用户文本。
