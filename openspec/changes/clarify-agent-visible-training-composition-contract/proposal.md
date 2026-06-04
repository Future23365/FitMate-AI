## Why

当前生产聊天已能通过 `searchExerciseResources` 查询发布态动作事实，并通过 `visibleTrainingProposal` 输出动作推荐、训练编排或按天计划。但模型可见合同仍容易把动作事实查询结果误读成“只能推荐一批动作”，或者把 tool 说明理解成固定流程指令，导致模型在用户提出更复杂训练目标时过早输出 `exercise_selection`。

本 change 需要把模型可见说明从“写死模型要做什么”调整为“说明工具能力、事实来源、输出结构和边界”，让模型基于当前可见事实自主推理是否继续调用 tool、澄清或输出结构化训练方案。

## What Changes

- 调整 Agent LLM prompt 的 `visibleTrainingProposal` 说明：只描述 `exercise_selection`、`routine`、`plan` 的结构能力和校验边界，不通过固定关键词、短语或用户表达模板规定模型必须选择哪种 `payload.kind`。
- 调整 `searchExerciseResources` 的 manifest / examples / observation 文案：表达该 tool 是发布态动作事实查询能力，返回的 `groups.<section>.exercises[*].exerciseId` 可作为 `visibleTrainingProposal.exerciseItems` 的受控事实来源，但 tool 本身不生成最终训练方案、处方、日程或保存结果。
- 调整 `searchExerciseResources` 模型可见 observation 的边界说明：明确当前 observation 只提供实际返回 section 的动作事实；如果模型选择输出的结构需要其他 section、`prescription` 或 `schedule`，模型应基于可见事实自主决定继续查询、澄清或输出当前事实可支撑的结构。
- 更新 `visibleTrainingProposal` 相关 spec，使训练方案组合合同表达为“可组合事实来源和结构要求”，而不是固定 tool 调用顺序、固定调用次数或服务端语义分流。
- 补充 prompt、manifest、observation 和 runtime 组合路径的测试，确保模型可见合同不包含自然语言关键词分流，不引入旧式 `generatePlanDraft` / `generateRoutineDraft` 能力，也不改变 `/api/chat` 主链路。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 默认 Agent LLM prompt 对 `visibleTrainingProposal` 的说明改为结构能力和事实边界说明，禁止把自然语言短语写成固定 `payload.kind` 选择规则。
- `agent-exercise-resource-query-tool`: `searchExerciseResources` 的模型可见说明和 observation 需表达动作事实来源、可组合边界、不可生成最终方案的职责边界。
- `visible-training-proposal`: 可见训练方案合同需表达 `exercise_selection`、`routine`、`plan` 由模型根据目标和事实自主选择，服务端只校验结构和数据库事实；训练方案组合不得依赖服务端关键词分流或固定 tool 调用顺序。

## Impact

- 影响文件：
  - `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
  - `tests/agent-core/agent-llm-prompt-config.test.ts`
  - `tests/agent-core/tool-registry-manifest.test.ts`
  - `tests/agent-core/contract-helper.test.ts`
  - `tests/chat-service.test.ts`
- 不新增生产业务 tool，不注册 `generatePlanDraft` / `generateRoutineDraft`。
- 不修改 `PlannerPort`、Agent runtime、`Policy Guard`、`ResourceStore`、`Resource Contract Validator`、Response Renderer 或 `/api/chat` 主链路。
- 不新增服务端关键词、正则、同义词表、短句模板或业务 `toolName` 特判。
