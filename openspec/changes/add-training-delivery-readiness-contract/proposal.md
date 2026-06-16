## Why

当前训练编排链路已经能通过 `searchExerciseResources` 返回可用动作候选，但模型缺少明确的训练编排交付判据，容易把“已有候选池”继续理解为“还需要逐肌群或逐 section 补查”，导致迟迟不调用 `submitVisibleTrainingProposal` 收口。

本次变更需要补齐模型可见的 ready-to-submit 合同，让模型在候选事实足以构造 `routine` 或 `plan` 时选择动作子集、补处方和日程，并进入结构化训练方案提交，而不是继续重复查询动作库。

## What Changes

- 在模型可见 Planner Policy 中补充训练编排交付判据，明确什么时候应停止同类动作查询并进入结构化训练方案提交。
- 在 `searchExerciseResources` 模型可见说明中澄清候选池、辅助阶段候选和 `coverage` 的事实边界，避免模型把局部窄查询缺口误判为整体不可交付；内部诊断字段继续留在 trace / userProjection。
- 在 `submitVisibleTrainingProposal` 模型可见说明中补充 `routine` / `plan` 的提交准入，明确动作候选和 section 已足够时应选择子集提交。
- 增加回归测试，覆盖训练编排 ready-to-submit 文案、tool description 边界和禁止服务端语义分流。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `visible-training-proposal`: 补充模型可见训练编排交付判据，明确 `routine` / `plan` 在候选事实足够时应通过 `submitVisibleTrainingProposal` 结构化收口。
- `agent-exercise-resource-query-tool`: 补充动作查询结果模型可见含义，明确候选池和局部窄查询缺口不等于最终训练方案不可交付。

## Impact

- 影响模型可见 prompt：`lib/server/langchain-agent/prompt.ts`
- 影响 LangChain tool description：`lib/server/langchain-agent/tools/exercise-resource-tools.ts`、`lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts`
- 影响测试：相关 prompt / tool description / model-visible contract 测试
- 不修改 LangChain runtime 主循环、tool handler 执行逻辑、`/api/chat` route、服务端关键词分流、数据库 schema 或 response adapter。
