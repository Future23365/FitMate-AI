## 1. 保存工具输入合同

- [x] 1.1 为 `saveConversationArtifactRevisionAgentToolInputSchema` 的可选 absence 字段增加 `null -> undefined` 归一化。
- [x] 1.2 保持缺少 `draftId` / `patchId`、缺少 payload、缺少 `artifactKind` 等 hard boundary 继续失败。
- [x] 1.3 补充 Agent tool decision prompt，明确首次 routine / plan 保存通过 `draftId` 解析 payload，不提交 `payload: null`。

## 2. 测试与文档

- [x] 2.1 增加回归测试，覆盖 trace 中 `sourceArtifactId: null`、`payload: null`、`patchId: null` 的保存输入可以成功使用 draft payload。
- [x] 2.2 增加回归测试，覆盖没有 draft 且 `payload: null` 仍失败。
- [x] 2.3 更新方案变更历史和项目演变历程，记录保存阶段 null optional 的真实根因。
- [x] 2.4 运行相关自动化检查，至少包括 agent-orchestrator / chat-service 测试、`npm run typecheck` 和 `openspec validate fix-agent-save-null-optionals --strict`。
