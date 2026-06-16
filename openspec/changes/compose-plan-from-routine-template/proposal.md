## Why

当前一周或多天 `plan` 请求容易让模型在动作候选已足够后跳过 `submitVisibleTrainingProposal`，退到普通最终回答或空结构化终态。根因是模型可见合同没有足够稳定地表达：`plan` 不是每天一套独立编排，而是一套可重复 `routine template` 加周期 `schedule`。

本变更要让模型在一次对话内直接交付 `plan`，但先在同一个 payload 内完成可重复单次编排，再补周期训练日 / 休息日安排，而不是依赖失败重试或让用户先可见一张 routine 卡片。

## What Changes

- 调整 `plan` 的模型可见组合合同，明确 `payload.kind = "plan"` 表示“可重复 routine template + schedule”。
- 调整默认 Agent prompt 的多天计划收口规则：动作候选覆盖足够时，模型应先在 `exerciseItems[]` 内构造 `warmup` / `training` / `stretch` 和 `prescription`，再补 `schedule.assignments`，并通过 `submitVisibleTrainingProposal` 一次性提交 `plan`。
- 调整 `submitVisibleTrainingProposal` 的 description 和 schema description，明确 `plan` 的 `exerciseItems[]` 不表示每天不同编排，`schedule` 只表达周期内 `training` / `rest` 日。
- 补充模型可见合同测试和 tool description 测试，覆盖一周计划一次性进入 `payload.kind = "plan"` 的稳定边界。
- 不新增服务端关键词分流、自然语言模板路由、runtime 业务 `toolName` 分支、provider tool call 改写或 response adapter 代生成 plan。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `visible-training-proposal`: 明确 `plan` 是同一套可重复 routine template 加周期 schedule，并约束模型在同一个 payload 中完成两者。
- `agent-llm-prompt-configuration`: 调整计划生成的 Planner Policy 和 flow example，让模型在候选事实足够时优先调用 `submitVisibleTrainingProposal(payload.kind="plan")`，而不是只用 `fitmate_final_response.content` 描述计划。

## Impact

- 影响 `lib/server/langchain-agent/prompt.ts` 的计划生成停止条件和示例。
- 影响 `lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts` 的 tool description 和 schema description。
- 影响 `openspec/specs/visible-training-proposal/spec.md` 与 `openspec/specs/agent-llm-prompt-configuration/spec.md` 的 delta。
- 影响相关 prompt / production tool catalog / `submitVisibleTrainingProposal` 合同测试。
