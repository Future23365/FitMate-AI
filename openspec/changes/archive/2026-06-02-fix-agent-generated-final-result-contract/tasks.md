## 1. Runtime 契约恢复

- [x] 1.1 在 Agent runtime 的决策解析失败分支识别保存成功后的缺字段 `final_result.generated`。
- [x] 1.2 从本轮成功的 `saveConversationArtifactRevision` tool result 补齐 `artifact`、`revisionId`、`validationId`、`policyDecisionId` 和必要 `usedToolResultIds`。
- [x] 1.3 恢复后的结果继续走 final result 引用校验；无法唯一补齐时保持 `model_output_invalid`。

## 2. Prompt、测试和文档

- [x] 2.1 强化 `agent_final_result` prompt 和系统消息中的终止格式示例，明确 `generated` 完整 JSON 结构。
- [x] 2.2 增加回归测试，覆盖当前 trace 的“保存成功后 final_result.generated 缺少资源字段”场景。
- [x] 2.3 更新方案变更历史和项目演变历程，记录这次保存后 final 契约恢复的真实根因。
- [x] 2.4 运行相关自动化检查，至少包括 `tests/agent-orchestrator.test.ts`、`npm run typecheck` 和 `openspec validate fix-agent-generated-final-result-contract --strict`。
