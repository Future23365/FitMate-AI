## Why

当前生产 Agent 的模型可见输入已经能覆盖主要安全边界和训练输出合同，但 `system prompt`、业务 tool 的 `whenToUse` / `whenNotToUse`、schema description、examples 和 observation 中存在较多同类终态规则重复。继续直接叠加规则会增加模型输入噪声，稀释对关键合同的注意力，也让后续 prompt 维护更难判断规则应该放在哪里。

本 change 目标不是为了缩短而缩短，而是在不削弱模型理解能力的前提下，把通用终态合同、业务 tool 独有边界和关键结构例子重新分层，使模型看到更紧凑、更稳定、更可执行的 prompt / manifest。

## What Changes

- 审计当前真实模型输入链路：`buildAgentActionSystemPrompt()` 生成的 system message，以及 `tools`、`observations`、`toolResults` 中进入 Planner 的模型可见内容。
- 收敛 `system prompt`：保留通用 `AgentAction`、terminal grounding、`visibleOutputs[]`、resource consumption、`visibleTrainingProposal` 输出前置条件和关键结构例子；删除或压缩只属于单个业务 tool 的操作细节。
- 收敛生产业务 tool 的 `description`、`whenToUse`、`whenNotToUse`、schema description 和 examples：只保留该 tool 独有能力、输入字段边界、输出事实边界和一到两个关键例子，不重复通用终态规则。
- 保留必要的动态 observation / repair feedback：对真实 tool result 才能判断的事实，如 `availableSections`、`missingSectionsForRoutineOrPlan`、`supportsOutputKinds`、`facts[]` 空结果含义、`requiredExerciseIds` / `excludeExerciseIds` 使用结果，继续在 observation 中暴露，但避免复制整段 system 规则。
- 更新相关 prompt / manifest / observation 合同测试，改为断言关键结构和边界仍存在，而不是要求完整长句逐字存在。
- 不新增服务端关键词、正则、短句模板、同义词表或业务 `toolName` 特判；不修改业务 tool handler、数据库查询、terminal validator、Response Renderer、Policy Guard 或 `/api/chat` 路由。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 默认 Agent LLM system prompt 需要在保持核心语义完整的前提下，将通用终态规则与业务 tool 独有规则分层，保留紧凑规则和关键结构例子。
- `agent-exercise-resource-query-tool`: `searchExerciseResources` 的模型可见说明需要聚焦动作事实查询、section-scoped 来源、facet / input 字段边界和查询结果的消费限制，避免重复通用 terminal / visible output 规则。
- `visible-proposal-reference-tool`: `inspectVisibleTrainingProposals` 的模型可见说明需要聚焦 `list_recent` / `read_recent` 的引用、resource role 和导入事实边界，避免重复通用 final answer 终态规则。
- `agent-exercise-mention-resolution-tool`: `resolveExerciseResourceMentions` 的模型可见说明需要聚焦点名动作解析和后续 `requiredExerciseIds` 衔接边界，避免重复最终训练输出规则。
- `agent-prompt-contract-governance`: 后续 prompt / manifest 变更需要显式检查规则分层、重复度和关键例子保留，而不是只检查规则是否存在。

## Impact

- 预计影响：
  - `lib/server/config/agent-llm-prompt-config.ts`
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
  - `lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts`
  - `lib/server/agent-tools/exercises/resolve-exercise-resource-mentions.tool.ts`
  - 相关 prompt / manifest / observation / manual LLM 黑盒测试
  - 必要的 OpenSpec spec 和文档
- 不影响：
  - `ToolRegistry` 注册范围
  - tool `inputSchema` / `outputSchema` 的字段语义
  - tool handler、repository 查询、ResourceStore、Policy Guard、Resource Contract Validator、terminal output validator、Response Renderer
  - `/api/chat` 外部请求、NDJSON stream、前端 UI 或数据库结构
