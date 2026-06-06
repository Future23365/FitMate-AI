## 1. OpenSpec 与治理

- [x] 1.1 使用 `agent-fix-abstraction-gate` 完成抽象层级门禁审查，确认没有把具体 trace、用户短句或业务 tool 字段组合升格为服务端语义规则。
- [x] 1.2 对照 `docs/llm-prompt-guidance.md`，确认本次规则落在 `Output Contract` / 模型可见合同层，而不是 `System Prompt` 长规则、Tool Manifest 或 Validator 语义判断。
- [x] 1.3 运行 `openspec validate harden-visible-training-plan-kind-contract --strict`。

## 2. Output Contract

- [x] 2.1 更新 `lib/server/config/agent-visible-output-contracts.ts`，强化 `visibleTrainingProposal` 中 `routine` / `plan` 的结构语义边界。
- [x] 2.2 在 output contract 中加入 `final_answer.content` 与 `visibleOutputs[].payload.kind` / `schedule.assignments` 的一致性说明。
- [x] 2.3 将 plan example 调整为 7 天周期 / 每周 3 练示例，保持 `one routine template + schedule`，不引入 `routines[]`、`routineId` 或 A/B 多模板结构。
- [x] 2.4 确认本 change 不修改 `searchExerciseResources`、`inspectVisibleTrainingProposals` 或其他 tool observation 的 `supportsOutputKinds`、`nextActionHints`、`finalAnswerSupport` 等字段。

## 3. 自动化测试

- [x] 3.1 更新 `tests/agent-core/agent-visible-output-contracts.test.ts`，断言合同包含正文 / payload 一致性、`routine` 单次边界、`plan` 的 `schedule.assignments` 边界和 7 天 3 练示例。
- [x] 3.2 更新 `tests/agent-core/adapter-llm-planner.test.ts` 或等价模型输入构造测试，确认 production Planner 请求实际包含新的 output contract 关键说明。
- [x] 3.3 更新 `tests/chat-service.test.ts` 中每周训练计划相关脚本化用例，确认最终用户事件为 `visibleTrainingProposal.payload.kind = "plan"` 且包含 `schedule.assignments`。
- [x] 3.4 增加或更新架构 / 治理测试，确认 `/api/chat`、Agent runtime、validator、tool handler 和 renderer 未新增用户原文关键词、正则、同义词或短句模板分流。

## 4. 手动 LLM 黑盒

- [x] 4.1 更新 `manual-tests/llm/basic-chat-fixtures.ts` 或等价 fixture，新增“每周训练计划 + 后续允许热身拉伸自行选择”的回归场景。
- [x] 4.2 更新 `manual-tests/llm/basic-chat-judge.ts` 或等价 judge，确保期望 plan 时，`kind = "routine"`、缺少 `schedule.assignments` 或只在正文 / suggestedQuestions 表达计划都判失败。
- [x] 4.3 如实现阶段允许真实模型验证，运行专用手动命令验证该 flow；若未运行，最终说明原因和剩余风险。

## 5. 验证

- [x] 5.1 运行与改动相关的自动化测试，例如 `npm test -- tests/agent-core/agent-visible-output-contracts.test.ts tests/agent-core/adapter-llm-planner.test.ts tests/chat-service.test.ts`。
- [x] 5.2 按需运行 `npm run typecheck`。
- [x] 5.3 最终 diff 检查：确认没有修改 tool observation 第 4 点相关文件，没有新增服务端语义分流，没有触碰无关脏文件。
