## 1. Schema 摘要修复

- [x] 1.1 调整 `summarizeJsonSchemaFields`，支持根级 `oneOf` / `anyOf` 的变体字段摘要。
- [x] 1.2 字段摘要保留 `const`，确保 `policyTarget` 这类判别字段可见。
- [x] 1.3 保持普通 object schema 的摘要输出兼容现有行为。

## 2. Agent 提示与验证

- [x] 2.1 补充 Agent tool decision prompt，明确首次生成 routine / plan 调用 `evaluatePolicy` 时必须提供 `artifactKind` 和 `draftId`。
- [x] 2.2 增加回归测试，覆盖 `evaluatePolicy` union schema 瘦身后仍包含 `new_artifact`、`artifactKind` 和 `draftId`。
- [x] 2.3 更新方案变更历史和项目演变历程，记录连续三次 `evaluatePolicy` 的真实根因。
- [x] 2.4 运行相关自动化检查，至少包括 chat-service / agent-orchestrator 测试、`npm run typecheck` 和 `openspec validate fix-agent-policy-schema-summary --strict`。
