## Why

当前生产聊天在省略表达、续问、替换或继续请求场景下，模型可能被历史 assistant 能力介绍带偏，即使本轮已经拿到新的 tool observation，也会退回通用自我介绍，导致上下文连贯性差。

本 change 需要收紧模型可见合同：服务端只提供本轮事实和可引用边界，不通过关键词、短句模板或业务条件替模型判断用户语义；模型应基于用户意图推理和当前可见事实自行决定如何回答、澄清或继续调用 tool。

## What Changes

- 在通用 Agent LLM prompt 中增加“省略表达 / 续问 / 引用对象”的推理规则，要求模型优先回应本轮用户请求，并结合 messages、metadata、observations 和 tool results 判断被引用对象是否真实存在且可引用。
- 强化 `inspectVisibleTrainingProposals(operation = "list_recent")` 的模型可见 observation 边界：只说明当前会话可引用 `visibleTrainingProposal` 事实索引的数量、空结果含义和可/不可支撑的事实边界，不提供答案模板。
- 明确禁止在 `/api/chat`、runtime、validator、tool handler 或 production route 中新增 `换一批`、`再来一组`、`factCount = 0` 等业务条件分支。
- 明确本 change 不实现强制 `final_answer` 引用本轮 tool result / resource 的 grounding guard；是否使用 tool result 由模型基于可见事实和用户意图自行判断。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 增加通用引用对象推理、缺失引用对象收口和历史 assistant 回复不可作为本轮模板的模型可见合同。
- `visible-proposal-reference-tool`: 增加 `list_recent` observation 的事实边界说明要求，确保空索引只作为模型推理事实，而不是服务端语义判断或答案模板。

## Impact

- 影响模型可见 prompt 配置：`lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`。
- 影响 `inspectVisibleTrainingProposals` 的模型可见 projection 文案：`lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts`。
- 影响相关 prompt / manifest / projection 测试和黑盒回归测试。
- 不修改 `/api/chat` 主链路、Agent runtime、validator、`Policy Guard`、`ResourceStore`、`Response Renderer`、tool handler 语义或数据库结构。
