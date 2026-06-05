## Why

2026-06-05 的真实 trace 显示，模型已经看到了“缺 `warmup` / `stretch` 时继续查询”的提示，但仍把目标明确的训练请求停在 `training` 动作列表或 `exercise_selection`。这说明当前 prompt 主要定义了 `routine` / `plan` 的结构形态和 section 完整性，却没有给模型足够清晰的“用户目标如何选择 `payload.kind`”的系统性合同。

当前 `payload.kind = routine` 的规则以“当模型已经判断用户目标需要 routine”为前提，但没有充分说明哪些语义目标应被模型视为一次可执行训练编排；`payload.kind = plan` 也需要更明确覆盖每周频次、周期和多天安排。结果是模型可以绕开 routine / plan 完整性要求，把本应完成编排的请求降级为动作推荐。

## What Changes

- 在默认 Agent system prompt 中补充 `visibleTrainingProposal.payload.kind` 选择指南，明确 `exercise_selection`、`routine`、`plan` 各自服务的用户目标、代表性语义范式和优先级。
- 在 prompt 中加入项目主要训练输出能力地图，让模型理解本产品的核心能力包括动作选择、单次训练编排、多天计划编排和基于已可见方案的调整。
- 明确如果用户目标语义已经需要 `routine` 或 `plan`，首次只查到 `training` 动作事实不能作为成功终态，也不能降级成 `exercise_selection`。
- 同步更新 `searchExerciseResources` 的模型可见 examples / manifest 说明，展示从主训练候选到补查 `warmup` / `stretch` 的常见 tool loop。
- 同步更新基础黑盒 judge prompt，使 `plan` 目标只输出动作列表、`exercise_selection` 或“下一轮再生成计划”时也判失败。
- 不新增服务端关键词分流、自然语言模板路由、正则、同义词表、固定 `toolName` 调用顺序或隐藏训练生成 service。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 默认 system prompt 需要表达训练输出类型选择合同、产品能力地图和代表性语义范式。
- `agent-exercise-resource-query-tool`: `searchExerciseResources` 的模型可见 examples / manifest 需要展示 routine / plan 目标下缺 section 时如何继续查询。
- `manual-llm-consistency-tests`: 基础黑盒 judge prompt 需要把 routine / plan 目标降级为动作列表的情况判失败。
- `chat-routine-composition`: 目标明确的 routine / plan 请求不应因为先获得 `training` 候选而停在动作推荐。

## Impact

- 影响模型实际可见输入：`lib/server/config/agent-llm-prompt-config.ts`、`searchExerciseResources` manifest / examples、基础黑盒 judge prompt。
- 影响测试：prompt config 测试、tool manifest / examples 测试、manual LLM judge contract 测试、相关 production replay 或黑盒合同测试。
- 不影响数据库 schema、Prisma migration、`/api/chat` 请求/响应 schema、Agent runtime 主循环、Policy Guard、ResourceStore、Response Renderer 或 tool handler 查询语义。
