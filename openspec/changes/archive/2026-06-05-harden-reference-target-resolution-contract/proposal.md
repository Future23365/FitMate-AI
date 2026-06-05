## Why

当前生产聊天在引用型请求中已经能查询“是否存在上一轮可见训练方案”，但模型在引用对象缺失时仍可能把“继续 / 替换 / 调整已有对象”的目标降级成相邻的新生成任务，并用新生成结果宣称完成刷新。

本 change 需要收紧模型可见合同：模型必须区分引用目标和独立生成目标；服务端继续只提供结构、权限、事实和 grounding 校验，不通过关键词、短句模板或业务 tool 条件替模型判断语义。

## What Changes

- 在通用 Agent LLM prompt 中增加“引用型请求与独立生成请求”的目标边界：若本轮请求依赖已有对象，必须先确认对象在当前可见上下文、tool result 或 consumable resource 中真实存在且可操作。
- 强化缺失引用对象的模型可见收口：对象不可确认时，不得改写成相邻的新生成目标，也不得输出结构化结果声称已经完成替换、刷新或调整。
- 收紧 `inspectVisibleTrainingProposals(operation = "list_recent")` 空索引 observation：空 `facts[]` 只表达当前会话没有可引用 `visibleTrainingProposal` 索引，可用于解释或澄清，不能支撑成功刷新、替换、调整或新训练方案生成。
- 收紧 `searchExerciseResources` observation：动作查询只证明查到了动作事实，不证明存在可刷新 / 可调整的上一轮对象；未应用 `excludeExerciseIds` 的查询结果不得被描述成已经完成对已有对象的刷新。
- 明确禁止新增 `/api/chat`、runtime、validator、tool handler 或 renderer 中的用户短语、关键词、`toolName` 或字段组合分流。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 增加通用引用目标解析、缺失引用对象收口、引用目标与独立生成目标区分的模型可见合同。
- `visible-proposal-reference-tool`: 收紧 `list_recent` 空结果 observation 的事实边界，避免空索引被模型转成成功刷新或新方案生成。
- `agent-exercise-resource-query-tool`: 收紧动作查询 observation 的事实边界，说明动作库查询结果不证明当前 run 存在可操作的已有训练方案对象。

## Impact

- 影响模型可见 prompt 配置：`lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`。
- 影响 `inspectVisibleTrainingProposals` 的模型可见 projection：`lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts`。
- 影响 `searchExerciseResources` 的模型可见 projection：`lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`。
- 影响相关 prompt / manifest / projection / production chat replay 测试。
- 需要补充 `docs/方案变更历史` 和 `docs/项目演变历程.md`，记录本次 Agent 引用目标合同收紧。
- 不修改 `/api/chat` 主链路、Agent runtime、validator、`Policy Guard`、`ResourceStore`、`Resource Contract Validator`、`Response Renderer`、tool handler 语义、API 契约或数据库结构。
