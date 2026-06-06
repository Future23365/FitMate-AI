# visibleTrainingProposal plan kind 输出合同收紧

时间：2026-06-06 16:52:30 CST

## 当前问题

生产聊天中，用户已经表达每周频次、周期或多天安排时，模型可能在 `final_answer.content` 中承诺一周训练计划，但结构化 `visibleTrainingProposal.payload` 仍输出 `kind = "routine"`，且没有 `schedule.assignments`。这会让正文像长期计划，卡片事实却只是单次训练编排。

原方案的问题不在 schema 基本形状：当前 schema 已能区分 `routine` 禁止 `schedule`、`plan` 必须包含 `schedule`。缺口在模型可见 output contract 没有明确要求正文承诺和 payload kind / schedule 保持一致。

## 调整思路

本次修复只收紧模型可见 `Output Contract`。`routine` 被定义为一次可执行训练编排，不能在正文中承诺周期计划；`plan` 被定义为 `one routine template + schedule`，必须用 `schedule.assignments` 表达训练日和休息日。正文如果承诺训练频次、周期、多天或一周安排，同一个 `visibleTrainingProposal` payload 必须是 `kind = "plan"` 并提供 `schedule.assignments`。

服务端仍只做结构、数据库事实、resource 和渲染边界校验，不读取用户原文、不解析正文语义，也不按关键词、正则、同义词或短句模板改写 `payload.kind`。

## 关键改动

- 强化 `lib/server/config/agent-visible-output-contracts.ts` 中的 `visibleTrainingProposal` output contract。
- 将 plan example 改成 7 天周期、每周 3 练、同一套 `exerciseItems` 重复使用的示例。
- 补充 output contract、Planner request、chat service 和 architecture boundary 测试，确保新规则实际进入生产模型输入，同时不落成服务端语义分流。
- 在 `llm基础测试.md` 新增每周训练计划回归 flow，并强化 manual LLM judge：期望 plan 时，`kind = "routine"`、缺少 `schedule.assignments` 或只在正文 / `suggestedQuestions` 表达计划都判失败。

## 验证

- `openspec validate harden-visible-training-plan-kind-contract --strict`
- `npm test -- tests/agent-core/agent-visible-output-contracts.test.ts tests/agent-core/adapter-llm-planner.test.ts tests/chat-service.test.ts tests/agent-core/architecture-boundary.test.ts tests/manual-llm-basic-blackbox.test.ts`
- `npm run typecheck`
- `git diff --check`

本次未运行 `npm run test:llm:basic`，因为它会调用真实模型和网络；该手动命令保留为后续人工黑盒验证入口。
