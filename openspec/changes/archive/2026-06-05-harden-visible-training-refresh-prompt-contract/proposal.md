## Why

最新 `文本聊天：换一批` trace 显示，hydration 已经正确保留最新 `user: 换一批`，`recentVisibleTrainingProposals` 也已经收敛为轻量索引，但 Planner 仍按原始需求重新查询同样条件并生成重复 routine。根因不再是消息去重或完整 payload 泄漏，而是模型可见合同没有把 `visibleTrainingProposal` 的编排 / 计划刷新语义讲清楚：刷新应优先替换上一套用户已看到的动作，而不是只用同一条件和同一排序重新生成。

## What Changes

- 调整 Agent LLM system prompt 的 `visibleTrainingProposal` 刷新语义：当用户基于上一套可见编排或计划表达替换、重新来一套、不满意或同类继续请求时，Planner 应理解为保留原目标和约束，优先让新的 `exerciseItems` 与上一套用户已看到动作产生实质差异，再重新组成完整 `exercise_selection` / `routine` / `plan`。
- 明确这不是固定短语路由：不得写成“用户说某个短语必须调用某个 tool”，不得在 `/api/chat` 或 Agent core 中新增关键词、正则、同义词表、短句模板或业务 `toolName` 特判。
- 调整 `inspectVisibleTrainingProposals` 的模型可见说明：当 Planner 需要知道上一套可见训练方案包含哪些已展示动作时，应读取当前 run 可见的真实事实引用；`list_recent` / `run.metadata.recentVisibleTrainingProposals` 仍只提供索引，不作为完整动作事实来源。
- 调整 `searchExerciseResources` 的模型可见说明：当 Planner 已经决定替换上一套可见训练方案中的动作时，可使用当前 run 已读取事实中的已展示 `exerciseId` 构造 `excludeExerciseIds`，并保持原目标、器械、难度、时长、section 等结构化约束。
- 补充规格和测试任务，覆盖原始 trace 形态和至少一个等价表达，验证模型可见合同包含刷新语义、事实读取路径、`excludeExerciseIds` 边界和禁止服务端语义分流。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 默认 AgentAction system prompt 需要表达 `visibleTrainingProposal` 的刷新语义：编排 / 计划的“换一批”目标是优先替换已展示动作，同时保留原目标和约束，并在候选不足时解释或澄清。
- `visible-training-proposal`: 可见训练方案合同需要明确 `exercise_selection`、`routine`、`plan` 在刷新时的结果要求，尤其是 `routine` / `plan` 不应仅按原始需求重新生成同一套动作。
- `visible-proposal-reference-tool`: `inspectVisibleTrainingProposals` 的模型可见说明需要表达读取上一套可见方案事实是为了让 Planner 获取已展示动作事实和结构摘要，但不得把固定自然语言短语写成强制 tool 调用条件。
- `agent-exercise-resource-query-tool`: `searchExerciseResources` 的模型可见说明需要表达 `excludeExerciseIds` 在可见训练方案刷新中的使用边界：只排除用户已看到或明确要求排除的动作，不排除内部候选。

## Impact

- 预计影响文件：
  - `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`
  - `lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts`
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
  - `tests/agent-core/agent-llm-prompt-config.test.ts`
  - `tests/agent-core/tool-registry-manifest.test.ts`
  - `tests/chat-service.test.ts`
  - `tests/agent-tools/inspect-visible-training-proposals.test.ts`
  - `tests/agent-tools/search-exercise-resources.test.ts`
- 不新增生产业务 tool，不新增 `refreshVisibleTrainingProposal` 专用 tool。
- 不修改 `/api/chat` route、PlannerPort、Executor、Policy Guard、ResourceStore、Resource Contract Validator、Response Renderer 或 Agent core 主循环。
- 不新增服务端自然语言关键词判断；服务端只提供事实索引、受控读取、动作查询、结构校验、权限隔离和 trace 证据。
