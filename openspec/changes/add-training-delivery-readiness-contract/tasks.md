## 1. 合同边界确认

- [x] 1.1 完成 prompt 合同治理检查：确认规则属于 Planner Policy、tool description 和模型可见说明，不触碰 runtime / core。
- [x] 1.2 完成抽象层级门禁检查：确认没有把具体用户短句、具体 trace 字段组合或服务端 toolName 分支升格为生产规则。

## 2. 模型可见合同实现

- [x] 2.1 在 `buildLangChainAgentSystemPrompt()` 中补充训练编排交付判据，明确 `routine` / `plan` 何时停止查询并提交结构化结果。
- [x] 2.2 更新 `searchExerciseResources` tool description，澄清候选池、辅助阶段局部窄查询缺口和 `coverage` 的事实边界。
- [x] 2.3 更新 `submitVisibleTrainingProposal` tool description，补充候选足够时的 `routine` / `plan` 结构化提交准入。

## 3. 测试与验证

- [x] 3.1 增加或更新 prompt / tool description 相关测试，覆盖训练编排 ready-to-submit 判据。
- [x] 3.2 增加或更新 model-visible contract gate 测试，确认没有新增服务端语义分流、固定用户短句触发、固定 workflow 或业务目标满足度字段。
- [x] 3.3 运行 `openspec validate add-training-delivery-readiness-contract --strict`。
- [x] 3.4 运行与 LangChain prompt / tool description / model-visible contract 相关的自动化测试。
- [x] 3.5 按需运行 `npm run typecheck`，或说明无法运行的原因。
