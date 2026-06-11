## 1. OpenSpec 与治理门禁

- [x] 1.1 使用 `agent-prompt-contract-governance` 确认本次 primary scope 是模型可见合同，不修改 runtime 主循环、response adapter、validator 或 `/api/chat` route。
- [x] 1.2 使用 `agent-fix-abstraction-gate` 检查修复方案没有把具体 trace、用户原话、`toolName` 或字段组合升格成通用生产规则。
- [x] 1.3 运行 `openspec validate strengthen-visible-training-proposal-delivery-contract --strict`，确认 proposal / design / spec / tasks 合法。

## 2. 模型可见合同实现

- [x] 2.1 更新默认 LangChain system prompt，只表达通用结构化训练结果交付边界：正文不能替代已校验训练卡片，且不写具体业务流程或固定 `payload.kind` 映射。
- [x] 2.2 更新 `submitVisibleTrainingProposal` 的 description 和 schema description，明确 `exercise_selection` / `routine` / `plan` 的用途、必填字段、禁止字段、动作事实来源和 accepted 输出含义。
- [x] 2.3 更新 `searchExerciseResources` 的 model observation / description 边界，说明查询结果是动作事实来源，不是最终 `visibleTrainingProposal` 或卡片。
- [x] 2.4 检查实现没有重新引入“必须来自当前 run 可消费事实”的终态交付门槛，且没有要求模型输出 `factRef`、`messageId`、`toolResultId`、`resourceId` 等内部 provenance 字段。

## 3. 回归测试

- [x] 3.1 更新 `tests/langchain-agent-tools/submit-visible-training-proposal.test.ts`，覆盖 `kind = "exercise_selection"` 成功生成 `validatedVisibleOutputs`，且不要求 `prescription` 或 `schedule`。
- [x] 3.2 更新 `tests/langchain-agent-tools/production-tool-catalog.test.ts` 或等价模型可见合同测试，覆盖 `submitVisibleTrainingProposal` 暴露 `exercise_selection` 用途和不恢复 current-run provenance 门槛。
- [x] 3.3 更新 `searchExerciseResources` 相关 tool contract 测试，覆盖 observation 表达查询结果不是最终卡片，且不得从用户短句或字段组合固定选择 `payload.kind`。

## 4. 验证与收尾

- [x] 4.1 运行 `npm test -- tests/langchain-agent-tools/submit-visible-training-proposal.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts` 和相关 `searchExerciseResources` 测试。
- [x] 4.2 如修改 TypeScript、schema description、AI 编排或共享业务逻辑，运行 `npm run typecheck`。
- [x] 4.3 重新运行 `openspec validate strengthen-visible-training-proposal-delivery-contract --strict`。
- [x] 4.4 最终 diff 检查确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判、具体业务 `toolName` 语义分支、前端正文解析或 response adapter 自动补卡片逻辑。
