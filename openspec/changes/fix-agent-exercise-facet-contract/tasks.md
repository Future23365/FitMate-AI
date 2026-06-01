## 1. 工具契约与检索实现

- [x] 1.1 扩展 `searchExercises` 输入类型和 Zod Schema，新增 `bodyRegions` 受控枚举字段。
- [x] 1.2 在动作检索服务中实现 `bodyRegions` 到动作库真实肌群 facet 的确定性展开，并将展开结果写入 diagnostics。
- [x] 1.3 增强空候选 diagnostics，返回 `unmatchedTargetMuscles`、`unmatchedEquipment`、`suggestedTargetMuscles`、`suggestedEquipment` 和 `retryable`。

## 2. Agent 决策与恢复

- [x] 2.1 更新 `searchExercises` 工具摘要和 Agent prompt，说明 `targetMuscles`、`equipment` 与 `bodyRegions` 的使用边界。
- [x] 2.2 让 Agent 在 `searchExercises` 返回可恢复未知 facet 诊断时基于建议 facet 重查一次，而不是立即 `blocked`。
- [x] 2.3 确保重查成功后的候选集合能继续进入 routine draft / validation 链路。

## 3. 测试与验证

- [x] 3.1 新增或更新动作检索单测，覆盖 `upper_body + 哑铃` 能返回候选，以及未知 facet 会给出可恢复诊断。
- [x] 3.2 新增或更新 Agent 编排测试，覆盖“今天想练上肢，30 分钟，有哑铃，帮我安排一套”不会因首次未知 facet 直接阻断。
- [x] 3.3 运行 `openspec validate fix-agent-exercise-facet-contract --strict`、`npm test` 和 `npm run typecheck`。

## 4. 文档与收尾

- [x] 4.1 在 `docs/方案变更历史` 新增本次 AI 动作 facet 契约修复记录。
- [x] 4.2 在 `docs/项目演变历程.md` 追加本次核心链路修复摘要。
- [x] 4.3 根据验证结果更新本 change 的任务状态并提交本次改动。

## 5. Routine 与推荐卡投影修复

- [x] 5.1 收紧 Agent prompt 和 `searchExercises` 工具摘要，要求单次训练编排请求使用 `candidateUse = "routine"` 并继续调用 `generateRoutineDraft`。
- [x] 5.2 在 `searchExercises` 工具结果摘要中保留 `candidateUse`，使 Response Writer 能区分推荐候选和 routine 候选。
- [x] 5.3 收窄动作推荐卡投影：只有 `candidateUse = "recommendation"` 的 `answered` 结果才投影推荐卡，且卡片 summary 不复制完整正文。
- [x] 5.4 补充测试覆盖 routine 请求不被投影成动作推荐卡、推荐卡 summary 不重复正文、Agent prompt 包含 routine 工具链约束。
- [x] 5.5 运行 `openspec validate fix-agent-exercise-facet-contract --strict`、`npm test` 和 `npm run typecheck`。
