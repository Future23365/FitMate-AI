## 1. Runtime 恢复

- [x] 1.1 在 Agent runtime 的决策解析失败分支识别保存前提前 `final_result.generated`。
- [x] 1.2 为可恢复提前终止错误写入合成反馈 tool result，并继续下一轮决策。
- [x] 1.3 保持不可恢复解析失败和引用缺失仍按 `model_output_invalid` 失败。

## 2. 提示、测试和文档

- [x] 2.1 强化 `agent_final_result` prompt，明确没有 `saveConversationArtifactRevision` / `revisionId` 时禁止返回 `generated` 或 `patched`。
- [x] 2.2 增加回归测试，覆盖当前 trace 的提前 final 后继续保存并最终 generated。
- [x] 2.3 更新方案变更历史和项目演变历程，记录这次提前 final 的真实根因。
- [x] 2.4 运行相关自动化检查，至少包括 agent-orchestrator / chat-service 测试、`npm run typecheck` 和 `openspec validate fix-agent-final-result-premature-save --strict`。
