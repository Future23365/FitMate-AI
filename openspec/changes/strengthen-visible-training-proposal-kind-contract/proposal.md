## Why

近期 trace 显示模型能够正确调用 `submitVisibleTrainingProposal`，但在 `visibleTrainingProposal.payload.kind` 的选择上不稳定：先把包含 `warmup` / `training` / `stretch` 的单次训练提交为 `routine` 却漏掉 `prescription`，随后又改成不等价的 `exercise_selection`，导致结构校验失败并触发连续调用上限。

当前模型可见合同已经描述了 `exercise_selection`、`routine`、`plan`，但系统 prompt、tool description 和 schema description 对三者的互斥边界不够判别式，容易让模型把“具体动作集合”默认归入 `exercise_selection`，而不是根据用户目标选择可执行训练结构。

## What Changes

- 收紧 LangChain Agent system prompt 中关于结构化训练结果的表达，避免把所有具体动作集合默认描述为 `exercise_selection`。
- 将 `submitVisibleTrainingProposal` 的模型可见说明改为明确的 `Kind Selection` 判别合同，区分：
  - `exercise_selection`：只用于纯主训练动作推荐集合。
  - `routine`：用于单次可执行训练，可包含 `warmup` / `training` / `stretch`，且每个动作项需要 `prescription`。
  - `plan`：用于多天或周期训练计划，需要 `schedule` 和动作处方。
- 补强 `visibleTrainingProposal` payload 的 schema description，使 `kind`、`prescription`、`schedule` 的条件必填和禁止关系在模型可见 schema 中更清晰。
- 更新相关 prompt / tool description / schema description 测试，验证生产模型可见合同包含新的判别边界。
- 不修改服务端 validator 的确定性校验规则，不放宽 schema，不新增自然语言关键词分流，不修改通用 tool wrapper 的失败反馈。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `visible-training-proposal`: 强化 `visibleTrainingProposal.payload.kind` 的模型可见选择合同，确保动作推荐、单次训练和多天计划的结构边界更清晰。
- `agent-llm-prompt-configuration`: 调整默认 LangChain Agent system prompt 中结构化训练结果的高层表达，避免默认 prompt 对 `exercise_selection` 产生过强偏置。

## Impact

- 影响文件预计包括：
  - `lib/server/langchain-agent/prompt.ts`
  - `lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts`
  - `lib/server/visible-training-proposals/visible-training-proposal-contract.ts`
  - 相关 prompt、tool catalog、schema description 测试
- 不影响 `/api/chat` 请求 schema、生产 tool catalog 注册列表、LangChain runtime 主循环、业务 validator、response adapter、数据库结构或前端事件合同。
