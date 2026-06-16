## Why

最新训练编排 trace 暴露出一个更早层级的问题：模型把没有指定具体肌群的单次训练请求，推理成需要补齐全身主要肌群候选池，导致反复调用 `searchExerciseResources` 而不进入结构化收口。此前“候选足够后停止查询”的合同只覆盖了候选消费阶段，没有前置约束模型的训练请求范围判定。

## What Changes

- 在模型可见 Planner Policy 中新增“训练请求范围判定”，明确未指定肌群不等于隐含全肌群硬约束。
- 调整 `searchExerciseResources` 的模型可见说明和 `muscles` schema description，要求 `muscles` 来自用户明确目标、已验证上下文或已收敛的少量必要目标，不得从宽泛训练目标展开成全身肌群清单。
- 调整 `submitVisibleTrainingProposal` 的模型可见说明，明确未指定具体肌群的 `routine` 不要求覆盖所有主要肌群，候选能组成受时长约束的可执行训练主体时应提交结构化结果。
- 更新决策示例和合同测试，覆盖泛化单次训练请求不应触发全肌群 inventory，同时保留用户明确要求全身覆盖时的合法查询空间。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 增加泛化训练请求的范围判定和首次查询前的收敛规则。
- `agent-exercise-resource-query-tool`: 收紧 `searchExerciseResources` 中 `muscles` 的模型可见来源和禁用场景。
- `visible-training-proposal`: 补充结构化 `routine` 的提交边界，明确未指定肌群时不要求全主要肌群覆盖。

## Impact

- 影响模型可见 prompt：`lib/server/langchain-agent/prompt.ts`
- 影响 LangChain tool description / schema description：`lib/server/langchain-agent/tools/exercise-resource-tools.ts`、`lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts`
- 影响测试：`tests/langchain-agent-runtime/runtime.test.ts`、`tests/langchain-agent-tools/search-exercise-resources.test.ts`、`tests/langchain-agent-tools/submit-visible-training-proposal.test.ts`、`tests/langchain-agent-tools/production-tool-catalog.test.ts`
- 不修改 LangChain runtime 主循环、tool handler、response adapter、数据库 schema、validator 或 `/api/chat` 语义分流。
