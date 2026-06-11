## Why

当前生产 trace 显示：模型已通过 `searchExerciseResources` 查询到动作事实，但最终只用正文列出动作，没有调用 `submitVisibleTrainingProposal`，导致 response adapter 没有 `visible_output` 事件，前端无法展示训练卡片。

需要收紧模型可见交付合同，让模型稳定区分“普通训练建议文本”和“需要作为用户可见、可后续引用的结构化训练结果交付”，同时避免恢复已移除的 current-run 可消费事实门槛或新增服务端短语分流。

## What Changes

- 明确 `visibleTrainingProposal(kind="exercise_selection")` 是动作候选 / 动作推荐卡片的正式结构化交付形态。
- 调整 `submitVisibleTrainingProposal` 的模型可见说明，区分 `exercise_selection`、`routine`、`plan` 的用途、字段要求、事实来源和输出含义。
- 调整 `searchExerciseResources` 的模型可见结果边界，说明成功查询只提供动作事实，不等于已生成用户可见训练卡片。
- 小幅收紧默认 LangChain system prompt 的通用交付规则：正文不能替代结构化训练结果，但不写具体用户短句、关键词、固定 `toolName` 流程或 `payload.kind` 短语映射。
- 补充回归测试，覆盖 `exercise_selection` 可通过 `submitVisibleTrainingProposal` 生成 `validatedVisibleOutputs`，并覆盖模型可见说明不会重新引入 current-run 可消费事实门槛。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 收紧训练卡片结构化交付的模型可见合同，并修正动作事实来源说明，避免要求模型证明 current-run 可消费事实。
- `agent-exercise-resource-query-tool`: 收紧动作查询 tool result summary 的模型可见边界，说明查询结果是动作事实来源而不是最终可见训练卡片。

## Impact

- 影响模型可见输入：
  - `lib/server/langchain-agent/prompt.ts`
  - `lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts`
  - `lib/server/langchain-agent/tools/exercise-resource-tools.ts`
- 影响测试：
  - `tests/langchain-agent-tools/submit-visible-training-proposal.test.ts`
  - `tests/langchain-agent-tools/production-tool-catalog.test.ts`
  - 可能新增或调整最窄的 prompt / tool contract 测试。
- 不修改前端、`/api/chat` route、LangChain runtime 主循环、response adapter、validator 业务语义、数据库 schema 或生产 tool catalog 白名单。
