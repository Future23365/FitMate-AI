# Agent 可见 Plan 组合合同收紧

时间：2026-06-04 21:45:48 CST

## 问题

真实 trace 显示，用户已经表达“在家减脂、无器械、每周 3 练、每次 25 分钟、动作简单一点”这类多天训练目标时，模型看到了新版 prompt 和 `searchExerciseResources` manifest，但首轮只查询了 `training` 动作事实，随后没有继续补齐 `warmup` / `stretch`，最终降级成动作推荐。

这个问题不适合在服务端用“每周”“训练日”等自然语言关键词改写 `payload.kind`。根因是模型首轮可见合同没有把多天计划如何从动作事实组合成 `plan` 讲清楚。

## 调整思路

把修复放在模型实际可见输入中：

- 通用 Agent prompt 说明 `plan` 的结构选择边界和生成顺序。
- `searchExerciseResources` manifest 说明它只提供动作事实原料，不生成最终训练方案。
- tool observation 在只返回 `training` 时明确提示缺少 `warmup` / `stretch` 事实，以及可继续查询的方式。

服务端仍只做结构、权限、数据库事实和 terminal validation，不新增语义分流。

## 关键改动

- `agentLlmPromptVersion` 升级到 `agent-action-v6`。
- `visibleTrainingProposal` prompt 增加 `plan` 生成路径：目标 / 限制 / 器械 / 时间 / 难度 -> `training` 动作事实 -> `warmup` / `stretch` 事实 -> `prescription` -> `schedule.assignments`。
- `searchExerciseResources` 的 `whenToUse` / `whenNotToUse` / schema description / examples 收紧 `routine` / `plan` 缺失 section 时的继续查询边界。
- `toModelObservation` 增加 `routinePlanCompositionBoundary`，暴露 `returnedSections` 和 `missingSectionsForRoutineOrPlan`。

## 验证

- `openspec validate harden-agent-visible-plan-composition-contract --strict`
- `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts`
- `npm test -- tests/agent-core/tool-registry-manifest.test.ts`
- `npm test -- tests/agent-core/contract-helper.test.ts`
- `npm test -- tests/agent-tools/search-exercise-resources.test.ts`
- `npm test -- tests/chat-service.test.ts`
- `npm test -- tests/agent-core/architecture-boundary.test.ts`
- `npm run typecheck`

未默认运行真实模型黑盒验证，避免在未确认 API 环境和费用的情况下消耗模型调用；本次用 ReplayPlanner 覆盖原始失败表达的确定性链路。
