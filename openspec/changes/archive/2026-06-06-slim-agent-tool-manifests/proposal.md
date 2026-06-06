## Why

当前生产 Agent 的 tool manifest 把工具说明、全局 Planner 规则、资源生命周期、validator 边界和历史修复提示混在每个 tool 中，导致 Planner 在长上下文下更容易抓住局部限制，输出半截 tool input 或回避必要 tool call。

本 change 目标是把 Planner 可见说明重新分层：通用 `AgentAction` / resource / grounding 规则集中到 `actionContract`，每个业务 tool 只表达自己的事实能力、输入要点、输出如何被下游消费，并把 examples 改为完整 `AgentAction` 示例。

## What Changes

- 将 `ToolExample` 从仅展示 `input` 调整为展示完整 `tool_call` action，降低模型输出 `{ operation: ... }` 这类半截 JSON 的概率。
- 在 `actionContract` 中集中表达全局 tool 使用禁令、资源术语 glossary、`requiredExerciseIds` / `excludeExerciseIds` 的通用引用策略和 failed / diagnostic grounding 边界。
- 瘦身 `inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions` 和 `searchExerciseResources` 的 `description`、`whenToUse`、`whenNotToUse` 与 examples，只保留各自差异化事实能力和下游消费规则。
- 收敛 `searchExerciseResources` 的模型可见器械合同：无器械在 tool input 中只引导使用 canonical `equipment: "no_equipment"`，不再把 `"无器械"` 作为推荐输出值展示给模型。
- 更新 manifest hardening、tool registry 和 prompt config 测试，验证示例为完整 `tool_call`、manifest 不重复承载全局禁止项、关键 glossary 和 canonical value 可见。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-tool-contract-kernel`: `ToolManifest.examples` 必须承载完整 `AgentAction` 形态的安全示例，而不是仅承载 tool input 片段。
- `agent-llm-prompt-configuration`: `actionContract` 必须集中表达全局 tool / resource / grounding glossary 与决策规则，避免业务 tool manifest 反复复制通用 Planner 禁止项。
- `visible-proposal-reference-tool`: `inspectVisibleTrainingProposals` 的模型可见说明必须压缩为 `list_recent` / `read_recent` 的事实能力、ref 来源和 downstream resource 边界。
- `agent-exercise-mention-resolution-tool`: `resolveExerciseResourceMentions` 的模型可见说明必须突出 mention 解析与 `requiredExerciseIds` 衔接，且说明本 tool 结果不能直接写入训练结构。
- `agent-exercise-resource-query-tool`: `searchExerciseResources` 的模型可见说明必须突出 section-scoped 动作事实、canonical `no_equipment`、facet 选择和过宽查询边界。

## Impact

- 影响模型可见合同：`lib/server/config/agent-llm-prompt-config.ts`、`lib/server/agent-core/contracts.ts`、`lib/server/agent-core/manifest.ts`、`lib/server/agent-core/manifest-hardening.ts`、三个生产业务 tool manifest。
- 影响测试：manifest / prompt config / contract helper / production registry 相关测试。
- 不修改 tool handler、repository、ResourceStore、Policy Guard、Response Renderer、`/api/chat` 请求契约或服务端语义分流。
