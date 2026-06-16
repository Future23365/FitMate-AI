## Why

当前直接生成多天 `plan` 时，模型在已经获得足够动作候选后仍继续调用 `searchExerciseResources`，最终触发连续工具调用上限，导致没有进入 `submitVisibleTrainingProposal` 结构化收口。根因是模型可见合同没有稳定表达：动作查询只提供动作候选事实，`prescription` / `schedule` 不会通过重复查询动作库获得。

## What Changes

- 调整默认 Agent prompt 的多天计划停止条件，表达已有动作候选足以组成计划时，应停止同类动作查询，并基于用户目标、频率、时长和保守训练编排构造 `prescription` / `schedule` 后提交结构化收口。
- 增强 `submitVisibleTrainingProposal` 的模型可见说明，明确 `routine` / `plan` 的 `prescription` 可由模型基于本轮目标、动作候选事实和保守训练编排常识生成，并由服务端 validator 校验。
- 增强 `searchExerciseResources` 的模型可见说明，明确该 tool 只返回动作候选事实，不返回 `prescription`、`schedule`、`routine` 或 `plan`；当缺口是 `prescription` / `schedule` 时，重复调用不会新增这类事实。
- 补充合同测试，覆盖新增 prompt / tool description 边界，防止模型可见合同回退成继续查动作库的固定循环。
- 不新增服务端关键词分流、自然语言模板路由、runtime 业务 `toolName` 分支、动作库 handler 特判或 provider tool call 改写。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `agent-llm-prompt-configuration`: 默认 Agent prompt 必须表达 plan 生成的停止条件，以及 `prescription` / `schedule` 不要求来自动作库查询结果。
- `agent-exercise-resource-query-tool`: `searchExerciseResources` 的模型可见说明必须表达该 tool 不产出处方、日程或训练计划事实，缺少这些字段时重复查询不会新增事实。
- `visible-training-proposal`: `submitVisibleTrainingProposal` 的模型可见合同必须表达 `routine` / `plan` 的 `prescription` 可由模型基于本轮目标和动作候选事实构造，并继续交由服务端 validator 校验。

## Impact

- 影响 `lib/server/langchain-agent/prompt.ts` 的默认 prompt 示例与停止条件说明。
- 影响 `lib/server/langchain-agent/tools/exercise-resource-tools.ts` 的 `searchExerciseResources` description。
- 影响 `lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts` 的 `submitVisibleTrainingProposal` description。
- 影响相关 OpenSpec delta、production tool catalog / model-visible contract tests。
