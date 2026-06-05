## Why

当前 `clarify-agent-visible-training-composition-contract` 已补充 `exercise_selection`、`routine`、`plan` 的结构边界，但真实 trace 仍显示用户提出每周频次、单次时长和训练目标时，模型只查询 `training` 动作事实，随后把回答降级为动作推荐。根因不是新版 prompt 或 manifest 未加载，而是模型可见合同没有把“多天计划应如何从动作事实组合成 plan”的决策与生成路径讲清楚。

本 change 需要优先收紧模型第一次决策时可见的训练计划组合合同：让模型知道多天 / 周期 / 频次类目标应优先产出 `payload.kind = "plan"`，并按受控动作事实、编排和 `schedule.assignments` 的顺序组织最终结构；修复不应依赖服务端关键词分流，也不应把 `repair feedback` 当作主修点。

## What Changes

- 调整 Agent LLM prompt 的 `visibleTrainingProposal` 说明：新增多天计划结构选择和生成顺序，明确 `plan` 需要先有主训练动作事实，再补齐 `warmup` / `stretch` 事实，随后生成带 `prescription` 的同一套编排，最后通过 `schedule.assignments` 表达训练日 / 休息日。
- 收紧事实不足时的降级边界：当模型判断用户目标需要 `routine` 或 `plan`，且当前可见 tool 可继续查询缺失 section 时，模型可见合同必须引导模型优先继续补齐事实或澄清 / 失败收口；不得因为只查到 `training` 动作就直接输出 `exercise_selection`。
- 调整 `searchExerciseResources` 的 manifest / schema description / examples / observation 文案：表达该 tool 是动作事实原料查询能力，并说明当最终目标是 `routine` 或 `plan` 且缺少 `warmup` / `stretch` 时，应继续按缺失 section 查询，而不是把主训练动作改写成热身 / 拉伸或降级成动作推荐。
- 更新 `visibleTrainingProposal` 相关 spec，使“多天计划”从结构定义升级为模型可见的组合流程要求，同时继续禁止服务端根据用户原文关键词、正则、同义词表或短句模板改写 `payload.kind`。
- 补充 prompt、manifest、observation 和 runtime 回归测试，覆盖“每周 3 练 / 25 分钟 / 居家无器械”等原始失败表达及至少一个等价表达，验证模型可见合同包含计划组合路径、缺失事实补齐要求和禁止降级边界。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 默认 Agent LLM prompt 需要表达多天计划的结构选择、事实补齐顺序和禁止从 `plan` / `routine` 目标降级为纯动作推荐的模型可见边界。
- `agent-exercise-resource-query-tool`: `searchExerciseResources` 的模型可见说明和 observation 需要表达 `routine` / `plan` 目标缺少 `warmup` / `stretch` 动作事实时的继续查询边界。
- `visible-training-proposal`: 可见训练方案合同需要明确 `plan` 的组合路径：`training` 动作事实 -> `warmup` / `stretch` 动作事实 -> 带 `prescription` 的同一套编排 -> `schedule.assignments`。

## Impact

- 影响文件：
  - `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
  - `tests/agent-core/agent-llm-prompt-config.test.ts`
  - `tests/agent-core/tool-registry-manifest.test.ts`
  - `tests/agent-core/contract-helper.test.ts`
  - `tests/chat-service.test.ts`
  - `tests/agent-tools/search-exercise-resources.test.ts`
- 不新增生产业务 tool，不注册 `generatePlanDraft` / `generateRoutineDraft`。
- 不修改 `/api/chat` route、`PlannerPort`、Executor、`Policy Guard`、`ResourceStore`、`Resource Contract Validator`、Response Renderer 或 terminal validator 的业务语义判断。
- 不新增服务端关键词、正则、同义词表、短句模板或业务 `toolName` 特判；`payload.kind` 仍由模型基于可见合同自主选择，服务端只校验结构、权限和数据库事实。
- `repair feedback` 不是本 change 的主修点；如实现中需要同步错误提示，也只能复用同一套模型可见合同，不能替代主 prompt / manifest 合同。
