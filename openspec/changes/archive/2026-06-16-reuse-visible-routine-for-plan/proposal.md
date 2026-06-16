## Why

当前 Agent 在已导入完整历史 `routine` 事实后，仍可能为了生成多天 `plan` 重新查询动作库，导致连续调用 `searchExerciseResources` 触发 runtime 上限，最终没有推送训练计划。根因是模型可见合同没有稳定表达：当历史训练事实已经提供可消费的动作、section 和 prescription 时，`plan` 可以复用这些事实并只补 `schedule`。

## What Changes

- 调整默认 Agent prompt 的停止条件和周期计划示例，表达“已有可消费训练事实足够时停止动作查询并进入结构化收口”。
- 增强 `inspectVisibleTrainingProposals` 的模型可见说明和 summary，暴露历史训练事实可复用字段、派生边界和 `plan` 还缺哪些结构字段。
- 增强 `submitVisibleTrainingProposal` 的模型可见说明，明确 `payload.exerciseItems[]` 可以来自动作查询候选，也可以来自已导入的历史 `visibleTrainingProposal` 事实；`schedule` 由模型基于本轮目标或保守默认构造并交给 validator 校验。
- 修复聊天请求 hydration 中当前 run 的 `latestUserMessage` 投影，避免 saved `conversationContext` 覆盖本轮真实最新用户输入。
- 补充回归测试，覆盖历史 routine 派生 plan、历史 exercise_selection 不伪装成完整 plan 来源，以及当前用户输入覆盖旧上下文。
- 不新增服务端关键词分流、自然语言模板路由、runtime 业务 `toolName` 分支或动作库查询 handler 特判。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `agent-llm-prompt-configuration`: 默认 Agent prompt 必须表达可消费历史训练事实足够时可以停止动作查询并派生周期计划。
- `visible-proposal-read-recent-contract`: `inspectVisibleTrainingProposals` 的模型可见历史事实摘要必须表达可复用字段、缺失字段和派生边界，不提供固定下一步 action。
- `visible-training-proposal`: `submitVisibleTrainingProposal` 的模型可见合同必须允许从已导入历史 `visibleTrainingProposal` 事实构造新的 `routine` / `plan`，并明确 `schedule` 的来源边界。
- `chat-context-summarization`: 服务端 hydration 必须保证本轮最新用户消息优先进入当前 run 的模型可见上下文事实摘要。

## Impact

- 影响 `lib/server/langchain-agent/prompt.ts` 的默认 prompt 文案。
- 影响 `lib/server/langchain-agent/tools/visible-training-proposal-tools.ts` 的 tool description 和 `toModelVisibleSummary`。
- 影响 `lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts` 的 tool description。
- 影响 `lib/server/chat/chat-service.ts` 的 current-run context merge。
- 影响相关 OpenSpec spec、tool-level tests、production catalog / model-visible contract tests 和 chat-service tests。
