## Why

最新生产 trace 显示，Planner 在只看到 `searchExerciseResources` 的 `groups.training` 结果后，直接生成了 `visibleTrainingProposal.payload.kind = "routine"`，并把只允许 `training` 的动作放入 `warmup`，最终被 `terminal_reference_invalid` 拦截并耗尽 repair。这个问题的主要根因不是 validator 过严，而是模型可见合同没有把 `visibleTrainingProposal.exerciseItems[*].exerciseId + section` 与当前 run 可见动作事实之间的证据关系表达清楚。

本 change 先从前置模型可见合同和 tool observation 投影入手，降低第一次非法输出概率；repair feedback 只作为保底，反馈确定性失败事实，不替 Planner 固定后续流程。

## What Changes

- 强化 `visibleTrainingProposal` 的模型可见证据合同：明确 `exerciseId`、`section` 和 `allowedSections` 的关系必须由当前 run 可见动作事实支撑。
- 调整 `searchExerciseResources` 的 manifest `whenToUse` / output 说明，明确 `groups.<section>` 与 `visibleTrainingProposal.exerciseItems[*].section` 的对应关系。
- 调整 `searchExerciseResources` 的 model observation projection，增加很短的 `groupSemantics` 摘要，说明本次返回的 `groups` 以 section 分组表达动作事实，不新增重复证据表。
- 强化 `visibleTrainingProposal` section 校验失败的结构化 repair feedback，保留 `path`、`exerciseId`、输出的 `section` 和数据库 `allowedSections`，让模型理解失败边界。
- 明确禁止服务端把该问题修成固定 tool 调用顺序、关键词分流、自动改 section、自动降级 payload kind 或放宽 validator。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `visible-training-proposal-validation`: 增强 section 边界失败的结构化诊断和 repair feedback 要求。
- `agent-exercise-resource-query-tool`: 增强 `searchExerciseResources` 模型可见 manifest 和 observation projection，表达 `groups.<section>` 与最终结构化输出 section 的事实对应关系。
- `agent-llm-prompt-configuration`: 增强默认模型可见合同，表达 `visibleTrainingProposal.exerciseItems[*]` 的事实来源与 `allowedSections` 关系，但不写业务流程特例。
- `agent-contract-repair-loop`: 增强 terminal visible output 校验失败进入下一轮 repair observation 的结构化字段要求，并保持 repair feedback 不替模型选择下一步。

## Impact

- 预计影响实现模块：
  - `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
  - `lib/server/visible-training-proposals/visible-training-proposal-validator.ts`
  - `lib/server/visible-training-proposals/visible-training-proposal-exercise-facts.ts`
  - `lib/server/agent-core/observation.ts`
  - 相关 prompt、manifest、projection、validator 和 runtime repair tests
- 不修改 `/api/chat` 请求/响应合同。
- 不修改 Agent runtime 主循环、`PlannerPort`、`Policy Guard`、`ResourceStore`、`Response Renderer` 主流程。
- 不新增依赖、数据库表或 Prisma migration。
