## 1. 模型可见输入收紧

- [x] 1.1 移除 `run.metadata.recentVisibleTrainingProposals` 中的具体 `factRef`。
- [x] 1.2 移除 `run.metadata.recentVisibleTrainingProposals` 中的具体 `messageId`。
- [x] 1.3 保留不含引用 id 的轻量状态摘要，避免模型失去“最近存在可见方案”的上下文信号。

## 2. Tool 合同收紧

- [x] 2.1 修改 `inspectVisibleTrainingProposals(operation = "read_recent")`，不再从 run metadata 判断引用可见性。
- [x] 2.2 只允许本轮 `list_recent` 结果或 diagnostic index resource 中的引用值进入 `read_recent`。
- [x] 2.3 更新 manifest、schema description、whenToUse / whenNotToUse，说明 metadata 不提供可复制引用。
- [x] 2.4 删除 `read_recent` fake `factRef` example，只保留安全 `list_recent` example。
- [x] 2.5 在 list/read observations 中说明 `factRef/messageId` 与 terminal `resourceId` 的边界。

## 3. Prompt 与 repair feedback

- [x] 3.1 更新默认 Agent prompt，明确 `usedRefs.resource.id` 必须是当前 run registered `resourceId`。
- [x] 3.2 更新默认 Agent prompt，明确 metadata 摘要不能作为 `read_recent` 输入、`exerciseId` 来源或 `usedRefs.resource.id`。
- [x] 3.3 为 `resource_missing` 增加通用 `domain_validation_failed` repair details。
- [x] 3.4 确认 agent-core repair feedback 不包含具体业务 toolName、用户短语或业务字段组合分支。

## 4. 测试

- [x] 4.1 更新 fact store metadata projection tests。
- [x] 4.2 更新 `inspectVisibleTrainingProposals` tool tests，覆盖 metadata-only 拒绝和 diagnostic resource 成功。
- [x] 4.3 更新 prompt / manifest tests，覆盖 fake example 删除和 resourceId 说明。
- [x] 4.4 更新 chat service replay tests，确保引用流程先 `list_recent` 再 `read_recent`。
- [x] 4.5 增加 terminal resource missing validator 回归测试。

## 5. 验证

- [x] 5.1 运行 `openspec validate harden-visible-proposal-grounding-refs --strict`。
- [x] 5.2 运行相关 unit tests。
- [x] 5.3 按需运行 `npm run typecheck`。
