## Why

2026-06-05 的 `/api/chat` 真实 trace 显示，模型已经看到当前 run 缺少 `warmup` / `stretch`，也看到 `searchExerciseResources` 可以继续查询缺失 section，但仍然直接输出了不完整的 `payload.kind = "routine"`，最终触发 `section_coverage_missing` 和 `repair_limit_exceeded`。

现有 prompt、tool manifest 和 observation 已经表达“应优先补齐”，但这仍然是建议式合同；需要把 `routine` / `plan` 的 final 前置条件写成模型可见的硬边界，让模型在缺 section 时先继续获取事实、澄清或失败收口，而不是用正文解释缺口后仍提交非法 `visibleOutputs`。

## What Changes

- 收紧默认 Agent LLM prompt 中 `visibleTrainingProposal` 的结构输出合同：当最终要输出 `payload.kind = "routine"` 或 `"plan"` 时，当前 run 必须已有 `warmup`、`training`、`stretch` 三类可消费动作事实。
- 明确 forbidden action：当 `missingSectionsForRoutineOrPlan` 非空时，模型不得输出 `final_answer.visibleOutputs[]` 中的 `routine` 或 `plan`；不得用正文说明“缺少热身/拉伸”后仍提交不完整结构。
- 明确 allowed next actions：缺 section 时模型只能继续调用当前可见 tool 查询缺失 section、使用 `ask_user` 澄清，或不输出 `visibleOutputs` 并说明当前事实不足。
- 收紧 `searchExerciseResources` 的模型可见 manifest、schema description、examples 和 observation：把 `missingSectionsForRoutineOrPlan` 表达为 `routine` / `plan` final 前置缺口，并提示用缺失 section 的 `suitabilities` 补查。
- 保留 AI 作为动作选择和训练编排的决策者；服务端只提供事实、结构校验和失败反馈，不生成动作编排。
- repair feedback 只作为最后兜底，同步表达不要重复提交缺 section 的 `routine` / `plan`，但不把 repair 当作主成功路径。
- 增加 prompt / manifest / observation / replay / 黑盒验证，证明模型可见合同在首轮正常路径中已经表达 final 前置条件。
- 不新增 `generatePlanDraft` / `generateRoutineDraft`，不新增服务端训练生成 tool，不修改 `/api/chat` 主链路、`agent-core` runtime、`PlannerPort`、Executor、Policy Guard、ResourceStore、Response Renderer 或业务 validator 的语义分流职责。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 默认 prompt 中 `routine` / `plan` 的 final 前置合同从“建议补齐”收紧为“缺 section 时禁止输出对应 visibleOutputs”。
- `agent-exercise-resource-query-tool`: `searchExerciseResources` 的模型可见说明和 observation 必须把缺失 section 表达为 `routine` / `plan` 输出前的事实缺口，并给出缺失 section 查询方式。
- `visible-training-proposal`: 从可见训练事实派生 `routine` / `plan` 时，模型可见合同必须禁止在 section 覆盖不足时提交成功结构化输出。

## Impact

- 影响 prompt / model input：
  - `lib/server/config/agent-llm-prompt-config.ts`
- 影响业务 tool 的模型可见说明和 observation：
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
- 影响可见训练方案 validator 的兜底失败说明，若实现时需要同步 repair 文案：
  - `lib/server/visible-training-proposals/visible-training-proposal-validator.ts`
- 影响测试：
  - prompt 配置或 model input builder 测试
  - `searchExerciseResources` manifest / observation 测试
  - Agent replay 测试
  - 真实 LLM 黑盒回归报告
- 不影响：
  - `/api/chat` 请求 / 响应合同
  - Agent runtime 主循环
  - tool handler 执行合同和数据库查询行为
  - 训练动作由 AI 选择和编排的产品边界
