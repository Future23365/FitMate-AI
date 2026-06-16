## Context

生产 `/api/chat` 使用 LangChain Agent Runtime 和 DeepSeek native `tool_calls`。当前可见训练方案事实桥已经能通过 `inspectVisibleTrainingProposals(operation = "list_recent")` 导入历史 `visibleTrainingProposal` 事实，且历史 `routine` fact 会暴露 `exerciseItems`、`section`、`prescription`、`sectionSummary` 和 `hasSchedule` 等摘要。

本次问题不是动作库缺数据，也不是 `visibleTrainingProposal` validator 不支持 `plan`。问题在于模型可见合同没有清晰表达：如果当前 run 已经有可消费历史训练事实覆盖动作、section 和 prescription，那么从 `routine` 派生 `plan` 时只需要构造 `schedule` 并进入结构化收口，不需要重新查询动作库。另一个辅助问题是 saved `conversationContext` 可能把旧 `knownFacts.latestUserMessage` 投影给模型，削弱当前 run 最新消息的优先级。

## Goals / Non-Goals

**Goals:**

- 让模型可见 prompt 表达稳定停止条件：已有可消费训练事实足以支撑结构时停止同类动作查询。
- 让 `inspectVisibleTrainingProposals` 的模型可见 summary 表达历史事实可复用字段和派生缺口，而不是给下一步 action 指令。
- 让 `submitVisibleTrainingProposal` 的模型可见说明接受历史 `visibleTrainingProposal` fact 作为 `exerciseItems` 事实来源。
- 修正当前 run 的 `latestUserMessage` 投影，确保 saved context 不覆盖本轮真实用户输入。
- 用测试证明修复覆盖原始问题类别和等价语义变体。

**Non-Goals:**

- 不新增服务端关键词、正则、同义词表或短句模板分流。
- 不修改 LangChain runtime 主循环、model factory provider payload、production response adapter 主流程或动作库查询 handler。
- 不让 `inspectVisibleTrainingProposals` 替模型决定 `payload.kind`、下一步 tool 或最终回答策略。
- 不引入新的 plan schema、持久化模型或每日独立编排能力。

## Decisions

### 1. Prompt 只表达停止条件，不写业务 tool 固定流程

默认 prompt 将新增稳定 Planner Policy：当当前可见事实已经提供可消费的 `exerciseItems`、`section` 和 `prescription`，且当前目标只缺周期内训练日 / 休息日安排时，模型可以补 `schedule` 并进入结构化训练收口。这样保留模型自主 tool calling，避免把本次 trace 的用户短句写成规则。

替代方案是只在 `submitVisibleTrainingProposal` description 中补说明。该方案不足以覆盖模型在进入 finalization tool 前的停止条件，因此保留为辅助说明而不是唯一修复。

### 2. 历史事实派生能力放在 `inspectVisibleTrainingProposals` 的 summary

`inspectVisibleTrainingProposals` 将增加 `derivationFacts` 摘要，按 fact 暴露：

- `reusableFields`: 当前历史 fact 可作为事实来源的字段集合，例如 `exerciseItems.exerciseId`、`exerciseItems.section`、`exerciseItems.prescription`、`schedule`。
- `missingForPlan`: 如果要构造 `plan`，当前 fact 仍缺少的结构字段，例如 `schedule` 或 `exerciseItems.prescription`。
- `boundary`: 表达这些字段只是事实覆盖摘要，新的训练方案仍必须通过 `submitVisibleTrainingProposal` 校验。

该 summary 不输出 `supportsOutputKinds`、`nextActionHints` 或固定 tool flow，避免模型把事实覆盖误读成服务端决策。

### 3. 结构化收口 tool 说明历史 fact 可以作为输入来源

`submitVisibleTrainingProposal` description 将明确 `payload.exerciseItems[]` 可以来自 `searchExerciseResources` 的候选事实，也可以来自 `inspectVisibleTrainingProposals` 导入的历史 `visibleTrainingProposal` 事实。`schedule` 的来源是本轮用户目标、明确周期、训练日 / 休息日安排或保守默认，并由 schema 与 validator 校验；它不是动作库查询结果。

### 4. Current-run 上下文合并只覆盖短期事实

`chat-service` 会继续保留 saved `conversationContext` 中的长期事实，但当前 run 会用基于 `rawMessages` 重建的上下文覆盖 `knownFacts.latestUserMessage`、低歧义数值事实和当前 summary。服务端仍不根据这些字段决定 toolName、payload.kind 或最终策略；语义判断继续由模型基于可见消息和工具事实完成。

## Risks / Trade-offs

- [Risk] 模型把 `derivationFacts` 误读为固定生成 `plan` 的命令。
  Mitigation: summary 字段只表达 reusable / missing 事实，并明确 boundary；测试和 model-visible contract gate 禁止 `nextActionHints`、`supportsOutputKinds` 和固定 tool 指令。

- [Risk] Prompt 过度泛化导致模型不查必要动作。
  Mitigation: prompt 文案使用正向准入条件，只允许在动作、section 和 prescription 已可消费时停止查询；事实不足时仍允许继续查询、澄清或失败收口。

- [Risk] 修 current-run context 时覆盖长期偏好。
  Mitigation: 合并函数只覆盖当前 run summary、latestUserMessage 和低歧义数值事实；长期器械、限制、偏好仍按现有 saved context 保留。

- [Risk] 与现有 OpenSpec 中 `read_recent` 语义不完全一致。
  Mitigation: 本实现只使用当前生产可见的 `list_recent`，不新增或恢复 `read_recent` 执行路径；delta spec 用 `inspectVisibleTrainingProposals` 泛化表述当前导入事实 summary。
