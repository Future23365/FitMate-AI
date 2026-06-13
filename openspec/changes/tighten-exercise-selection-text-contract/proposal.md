## Why

当前 LangChain Agent 已能通过 `submitVisibleTrainingProposal` 拦截 `exercise_selection` 中错误出现的 `prescription`，但最终用户可见正文仍可能主动输出组数、次数、休息时间和训练频率。用户只请求动作推荐时，这类处方型表达会把“推荐动作”混成“训练编排”，导致结构化 payload 与正文合同不一致。

本变更要让模型可见合同稳定区分动作推荐解释和训练编排处方：`exercise_selection` 只交付动作集合与解释，`routine` / `plan` 才承载可执行处方或日程。

## What Changes

- 调整 LangChain Agent system prompt：当回答只是动作推荐集合时，`content` 只解释推荐理由、目标肌群、适用场景、动作差异和注意事项。
- 调整 `submitVisibleTrainingProposal` 的 schema description / tool description：明确 `payload.kind = "exercise_selection"` 表示动作推荐集合，不承载 `prescription` / `schedule`，正文也不得绕过该边界主动输出组数、次数、时长、休息、训练频率或日程。
- 保留 `routine` / `plan` 的处方语义：当用户目标需要一次可执行训练或多天计划时，模型应选择对应 `kind`，并由 payload 的 `prescription` / `schedule` 支撑正文。
- 更新 prompt / tool contract 测试，覆盖动作推荐正文边界和 `exercise_selection`、`routine`、`plan` 的语义区分。
- 不修改 `repair feedback`、validator、LangChain runtime、tool handler、response adapter、API route、数据库结构或服务端自然语言判断逻辑。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 收紧动作推荐正文的模型可见边界，避免 `content` 在动作推荐场景主动输出处方参数。
- `visible-training-proposal`: 明确 `exercise_selection` 的用户可见正文必须与动作推荐结构一致，不能把正文处方当作动作执行事实或绕过结构合同。
- `agent-tool-contract-kernel`: 补强 `submitVisibleTrainingProposal` 的模型可见说明，使 finalization tool 清楚表达 `exercise_selection` 与 `routine` / `plan` 的处方边界。

## Impact

- 影响 `lib/server/langchain-agent/prompt.ts` 中 LangChain Agent system prompt 的模型可见规则。
- 影响 `lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts` 中 `submitVisibleTrainingProposal` 的 schema description 和 description。
- 影响相关 prompt / tool description contract tests。
- 不影响 `/api/chat` 请求/响应 schema、LangChain runtime 主循环、tool wrapper 执行、validator、response adapter、Prisma schema、数据库迁移、权限或持久化边界。
