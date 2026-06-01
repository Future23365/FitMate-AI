## 1. Agent 推荐与候选搜索修复

- [x] 1.1 为 `searchExercises` 增加结构化 facet 短别名恢复，覆盖 `胸`、`胸肌`、`胸大肌`、`腿`、`腿部` 等常见工具入参。
- [x] 1.2 调整推荐卡片投影，当本轮存在成功的 `searchExercises(candidateUse="recommendation")` 时，不因最终结果漏写 `usedToolResultIds` 丢失卡片。
- [x] 1.3 补充动作搜索和推荐投影单测。

## 2. 新建 routine/plan artifact 写入修复

- [x] 2.1 扩展 `evaluatePolicy`，支持首次创建聊天 artifact 的 `new_artifact` policy 目标。
- [x] 2.2 扩展 `saveConversationArtifactRevision`，在缺少 `sourceArtifactId` 但提供 `artifactKind` 时创建新的 `ConversationArtifact`。
- [x] 2.3 保留已有 revision 写入路径的 source artifact 校验和 superseded 行为。
- [x] 2.4 补充新建 artifact 和 revision 写入单测。

## 3. 长期 plan 首次生成修复

- [x] 3.1 允许 `generatePlanDraft` 在没有 `sourceArtifact` 时使用本轮候选集合构造 seed routine。
- [x] 3.2 确保 plan draft 仍经过 `DomainPlanEngine` 和 Validator。
- [x] 3.3 确保 Validator 不把恢复日按单次训练时长做硬失败。
- [x] 3.4 补充无 source artifact 的 plan draft 和恢复日时长校验单测。

## 4. 黑盒报告收口

- [x] 4.1 调整黑盒 runner 的实际卡片类型统计，训练卡片出现时过滤同轮 `answer` 状态。
- [x] 4.2 补充或调整相关黑盒报告统计单测。

## 5. 验证

- [x] 5.1 运行相关 Vitest 用例。
- [x] 5.2 运行 `npm run typecheck`。
- [x] 5.3 运行 `openspec validate fix-agent-finalization-blackbox-regressions --strict`。
