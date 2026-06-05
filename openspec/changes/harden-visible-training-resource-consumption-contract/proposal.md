## Why

最新两条生产 trace 暴露的是同一类合同缺口：模型能读取上一轮用户可见训练方案，也能看到动作查询结果，但不能稳定判断这些事实在当前轮应作为正向来源、负向排除对象，还是只能支撑部分输出结构。

这会导致模型把可复用动作错误放进 `excludeExerciseIds`，或在只有 `training` 动作事实时输出完整 `routine` 并伪造 `warmup` / `stretch`。需要补强模型可见合同、业务 resource projection 和 repair feedback，而不是新增服务端关键词分流或针对某个用户短句写规则。

## What Changes

- 新增可见训练资源消费合同：引用到已有可见资源后，Planner 需要区分 `reuse`、`derive`、`modify`、`replace`、`clarify` 等稳定操作类型；该分类只存在于模型可见推理合同和测试中，不由服务端基于用户原文判断。
- 明确 `visible_training_proposal_fact` 是当前 run 的正向可消费训练事实来源，同时必须声明其 section 覆盖能力：已有事实覆盖哪些 section、能直接支撑哪些 `payload.kind`、生成 `routine` / `plan` 时还缺哪些 section。
- 收紧 `searchExerciseResources` 的 `excludeExerciseIds` 与 `requiredExerciseIds` 边界：`excludeExerciseIds` 只表示替换、排除或避免重复的负向约束；`requiredExerciseIds` 只表示将受控动作 id 作为正向查询锚点，不能把单一 section 查询结果伪装成完整训练方案。
- 增强 `inspectVisibleTrainingProposals(operation = "read_recent")` 的 model observation：导入历史可见训练方案后，向模型暴露可复用动作事实摘要、resource role、section coverage 和 output support 边界。
- 增强 `visibleTrainingProposal` terminal validation repair feedback：当最终输出引用的动作 section 不合法、或目标结构缺少必要 section 时，反馈应表达失败字段、当前事实覆盖、缺失 section 和可恢复方向，但不得指定固定 tool 调用顺序。
- 增加回归测试，覆盖具体失败 trace 和等价语义变体；测试样例只作为验证，不进入生产 prompt 触发规则。
- 明确禁止新增 `/api/chat`、Agent runtime、validator、tool handler、renderer 中基于用户原文、关键词、短句模板、具体 `toolName` 或字段组合的语义分流。

## Capabilities

### New Capabilities
- `visible-training-resource-consumption`: 定义当前 run 可见训练资源的操作类型、正向/负向消费边界、section coverage、output support 和 repair 恢复原则。

### Modified Capabilities
- `agent-llm-prompt-configuration`: 增加通用引用资源操作合同，要求模型区分复用、派生、调整、替换和澄清，不用固定短语或业务 toolName 触发。
- `visible-training-proposal`: 明确从历史可见训练事实派生 `exercise_selection`、`routine`、`plan` 时必须受 section coverage 和 output support 约束。
- `visible-proposal-read-recent-contract`: 增强 `read_recent` 成功 observation 的 resource role、可复用动作事实和 section coverage 投影。
- `agent-exercise-resource-query-tool`: 收紧 `excludeExerciseIds`、`requiredExerciseIds` 和 `groups.<section>` 结果的模型可见消费边界。
- `visible-training-proposal-validation`: 增强 `terminal_reference_invalid` / `section_not_allowed` 等失败的模型可恢复诊断，避免模型重复伪造不可支撑结构。

## Impact

- 预计影响模型可见 prompt：`lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`。
- 预计影响业务 tool manifest / schema description / observation projection：
  - `lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts`
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
- 预计影响 visible output validation repair / projection 边界：
  - `lib/server/visible-training-proposals/*`
  - Agent terminal validation / repair observation 相关测试
- 预计影响测试：
  - `tests/agent-core/agent-llm-prompt-config.test.ts`
  - `tests/agent-core/tool-registry-manifest.test.ts`
  - `tests/agent-core/contract-helper.test.ts`
  - `tests/agent-tools/inspect-visible-training-proposals.test.ts`
  - `tests/agent-tools/search-exercise-resources.test.ts`
  - `tests/visible-training-proposal-validator.test.ts`
  - `tests/chat-service.test.ts` 或等价 production replay / blackbox 回归
- 需要补充 `docs/方案变更历史` 和 `docs/项目演变历程.md`，记录本次 Agent 可见训练资源消费合同收紧。
- 不修改数据库结构、Prisma schema、`/api/chat` 路由语义、Agent core 主循环、`Policy Guard`、`ResourceStore`、`Response Renderer` 或服务端自然语言分流。
