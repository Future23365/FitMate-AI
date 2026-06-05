## Why

2026-06-05 的基础黑盒报告显示，目标明确的单次 routine 请求仍会返回安全错误，或只给 `training` 动作列表并让用户自行组合。之前的 `harden-routine-plan-section-readiness-contract` 只阻止缺 section 的非法 `routine` / `plan` 输出，没有补强“候选足够时应继续补齐并生成完整 routine”的正向成功路径。

## What Changes

- 收紧模型可见 routine 组合合同：当模型已判断用户目标需要一次可执行 `routine`，且当前已有可满足主训练的 `training` 动作事实、可见 tool 仍能查询缺失 section 时，应继续获取 `warmup` / `stretch` 动作事实并输出完整三段式 `routine`。
- 明确候选不足的可恢复边界：若缺失 section 查询为 0 条、查询过宽、约束冲突或 tool 不可用，模型应使用 `ask_user` 或不带 `visibleOutputs` 的 `final_answer` 说明缺口和下一步，不让用户自行把动作列表拼成训练。
- 更新 `searchExerciseResources` 的 manifest、schema description、examples 和 observation，让补查缺失 section 表达为 routine 正向组合步骤，而不是可选建议。
- 补充自动化回归，覆盖直接 routine 请求在先查 `training` 后继续查 `warmup` / `stretch` 并输出完整 `routine`，以及候选不足时不降级为动作列表。
- 不新增服务端关键词分流、自然语言模板路由、隐藏训练生成 service 或旧 `generateRoutineDraft` 工具。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 默认 prompt 中 routine 组合路径需要表达“候选足够时继续补齐并生成完整 routine”的正向终态，而不是只禁止缺 section 输出。
- `agent-exercise-resource-query-tool`: `searchExerciseResources` 的模型可见合同需要把缺失 section 查询表达为 routine 组合中的正常下一步，并在候选不足时给出可恢复收口边界。
- `visible-training-proposal`: `visibleTrainingProposal.payload.kind = "routine"` 的模型可见合同需要禁止把明确 routine 目标降级成 `exercise_selection` 或动作列表正文。
- `chat-routine-composition`: 单次 routine 黑盒失败暴露出的正向生成稳定性需要落为聊天 routine 组合要求。

## Impact

- 影响模型实际可见输入：`lib/server/config/agent-llm-prompt-config.ts`、`searchExerciseResources` manifest / schema description / examples / observation。
- 影响测试：`tests/chat-service.test.ts`、`tests/agent-tools/search-exercise-resources.test.ts` 或等价 tool-level / manifest / production replay 测试。
- 不影响数据库 schema、Prisma migration、`/api/chat` 请求/响应 schema、Agent runtime 主循环、Policy Guard、ResourceStore 或 Response Renderer。
