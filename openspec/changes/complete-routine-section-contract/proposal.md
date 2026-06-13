## Why

当前 LangChain Agent 在用户追问“安排核心训练计划、包括组数和次数”时，容易把任务收窄成只给主训练动作处方，最终生成只包含 `training` 的 `routine`。这会让用户看到的训练卡片缺少热身和拉伸，也让后续建议提问承担了本应由完整训练编排合同承担的职责。

需要把“完整单次训练 routine 默认由 `warmup`、`training`、`stretch` 三段组成”表达为模型可见的稳定业务合同，让模型自主规划三段动作事实、处方和最终结构化输出，而不是通过服务端关键词分流或 response adapter 补按钮。

## What Changes

- 明确完整 `routine` 的模型可见合同：默认包含 `warmup`、`training`、`stretch`，其中 `training` 承载用户的主训练目标，例如核心、胸部、下肢或全身。
- 调整 `submitVisibleTrainingProposal` 的 tool description / schema description，使 `payload.kind = "routine"` 与完整三段编排语义对齐，并保留用户明确只要部分范围时的合法出口。
- 调整 `searchExerciseResources` 的模型可见说明，使模型知道完整 routine 需要按 section 获取动作事实，但不得把缺失 section 写成固定继续调用流程。
- 在 `submitVisibleTrainingProposal` accepted 后的模型可见摘要中增加已校验输出的 section 覆盖事实，例如 `sectionSummary`、`availableSections`、`missingSections`，用于最终回答和建议提问的 grounded 推理。
- 增加回归测试，覆盖“核心训练计划”这类主目标应落在 `training` 段、完整 routine 默认包含热身和拉伸，以及用户明确只要主训练时允许部分输出并通过建议提问继续补全。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `visible-training-proposal`: 强化 `routine` 的默认完整三段编排语义，以及 accepted 后模型可见 section 覆盖事实。
- `agent-exercise-resource-query-tool`: 强化 `searchExerciseResources` 对 section 查询事实的模型可见边界，支持完整 routine 的动作事实规划但不写固定 workflow。
- `agent-llm-prompt-configuration`: 保持默认 prompt 分层边界，确认完整 routine 细则由 tool description / schema description / tool result summary 承载，而不是写进通用 system prompt 或服务端分流。

## Impact

- 影响 `lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts` 的模型可见说明和 accepted summary。
- 影响 `lib/server/langchain-agent/tools/exercise-resource-tools.ts` 的 tool description / schema description。
- 可能影响 `lib/server/langchain-agent/prompt.ts` 的高层结构化交付说明，但不写入具体业务 toolName 触发条件或固定查询流程。
- 增加或更新 LangChain Agent runtime / tool contract tests。
- 不修改 `/api/chat` 请求合同、production response adapter 主流程、LangChain runtime 主循环、数据库 schema 或前端事件协议。
