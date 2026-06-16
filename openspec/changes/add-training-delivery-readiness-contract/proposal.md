## Why

当前训练编排链路已经能通过 `searchExerciseResources` 返回可用动作候选，但模型缺少明确的再次查询前自检合同，容易把“已有候选池”继续理解为“还需要逐肌群、逐 section 或扩大数量补查”，导致迟迟不调用 `submitVisibleTrainingProposal` 收口。

本次变更需要补齐模型可见的候选事实消费合同，让模型自主区分“缺数据库动作事实”“缺训练编排字段”“缺用户必须确认的约束”。只有缺数据库动作事实时才继续查询动作库；缺 `prescription`、`schedule`、动作取舍、动作顺序、组数次数或休息时，应由模型基于当前可见候选事实构造结构化训练方案并提交校验。

## What Changes

- 在模型可见 Planner Policy 中补充“训练结构化交付前模型自检”，明确再次查询动作库的正向准入条件。
- 在 `searchExerciseResources` 模型可见说明中澄清候选池、`truncated`、`totalMatches`、辅助阶段候选和 `coverage` 的事实边界，避免模型把候选池不完整误判为必须继续查询；内部诊断字段继续留在 trace / userProjection。
- 在 `submitVisibleTrainingProposal` 模型可见说明中补充 `routine` / `plan` 的提交准入，明确当缺口只剩编排字段时应选择候选子集并提交结构化训练方案。
- 增加回归测试，覆盖模型自检文案、tool description 边界和禁止服务端语义分流。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `visible-training-proposal`: 补充模型可见训练编排提交准入，明确缺口只剩编排字段时应通过 `submitVisibleTrainingProposal` 结构化收口。
- `agent-exercise-resource-query-tool`: 补充动作查询结果模型可见含义，明确候选池、`truncated`、`totalMatches` 和局部窄查询缺口不等于最终训练方案不可交付。

## Impact

- 影响模型可见 prompt：`lib/server/langchain-agent/prompt.ts`
- 影响 LangChain tool description：`lib/server/langchain-agent/tools/exercise-resource-tools.ts`、`lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts`
- 影响测试：相关 prompt / tool description / model-visible contract 测试
- 不修改 LangChain runtime 主循环、tool handler 执行逻辑、`/api/chat` route、服务端关键词分流、数据库 schema 或 response adapter。
