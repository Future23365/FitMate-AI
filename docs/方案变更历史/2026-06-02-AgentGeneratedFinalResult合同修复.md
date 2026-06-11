# Agent Generated Final Result 合同修复

记录时间：2026-06-02 00:25:50 CST

## 真实问题

最新 trace 中，Agent 已经完整跑完 `searchExercises -> generateRoutineDraft -> validateRoutineDraft -> evaluatePolicy -> saveConversationArtifactRevision`，保存工具也返回了 `artifactId`、`revisionId`、`validationId` 和 `policyDecisionId`。但模型最后返回的 `final_result.generated` 仍像普通回答一样只包含 `replyContext.reply` 和 `usedToolResultIds`，缺少 `generated` 合同要求的 `artifact`、`revisionId` 和 `validationId`。

结果是：系统事实上已经保存了训练编排，却在最后解析阶段把整轮降级为 `model_output_invalid`，用户只能看到“这次执行没有完成”。

## 调整思路

不放宽 `AgentExecutionResult.generated` 的 Schema，也不让 Response Writer 自行解释保存是否成功。正确边界是：如果保存工具已经在本轮成功返回结构化资源，runtime 可以把模型漏填的终止合同字段从已登记 tool result 中补齐；如果没有保存结果或保存结果字段不完整，则继续失败，避免伪造成功。

## 关键改动

- Agent runtime 新增保存后缺字段 `final_result.generated` 的恢复逻辑。
- 恢复结果只从本轮成功的 `saveConversationArtifactRevision` tool result 读取 `artifactId`、`artifactKind`、`title`、`summary`、`revisionId`、`validationId` 和 `policyDecisionId`。
- 恢复后的 final result 仍走原有引用校验，确保 `usedToolResultIds`、`validationId`、`policyDecisionId` 和 `revisionId` 都属于当前 run。
- Agent final result prompt 和系统消息新增 `generated` 完整 JSON 示例，减少模型继续输出 `replyContext` 形态。

## 结果

保存成功但 final result 漏字段时，不再丢弃已保存 artifact；系统会产出合法 `AgentExecutionResult.generated`，让后续 Response Writer 和前端卡片继续消费真实保存结果。
