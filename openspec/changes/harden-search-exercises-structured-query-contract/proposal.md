## Why

最新 AI Trace 中，用户要求“换一套没有器械的”，LLM 已经理解要查无器械上肢 routine，但 `searchExercises` 仍返回固定器械、杠铃、壶铃和绳索器械动作。根因不是单个词识别失败，而是 `searchExercises` 仍是半自然语言混合检索工具：LLM 需要临时拼底层过滤字段，服务端没有把这些字段作为严格、可证明、可被后续工具继承的结构化查询合同。

这个问题会影响所有 Agent tool：LLM 能理解用户意图并传参，但 tool 如果没有明确的能力合同，就可能执行不了、执行偏、静默放宽，最后把半成品链路包装成成功结果。只修“无器械”或只修 `searchExercises` 会继续留下同类架构问题。

## What Changes

- 建立统一的 Agent tool capability contract：每个 tool 必须声明自己能执行什么操作、需要哪些输入、如何严格执行、产出什么证据、哪些请求必须拒绝或澄清。
- LLM 负责理解用户语义并传入结构化参数；tool 负责严格执行这些参数，不再依赖 prompt 文案、工具名或 runtime 特例猜测操作含义。
- tool MUST 在参数不足、参数非法、能力不支持、资源不唯一或无法证明执行结果满足参数时返回结构化失败，不能静默放宽后继续成功。
- 将 `searchExercises` 从“query + 少量结构化字段”的半自然语言检索收紧为受控结构化动作查询执行器。
- LLM 仍负责决定要查哪些结构化查询字段；服务端不读取用户原文做关键词判断，也不改写 LLM 的高层语义。
- `searchExercises` MUST 只接受白名单过滤字段、合法枚举和动作库真实 facet；执行型候选集合必须按这些字段做确定性 hard filter。
- `query` 只能作为召回或排序信号，不能承载执行型 hard constraint；当结构化查询字段不足以表达执行候选边界时，工具必须返回可恢复结构化失败。
- `searchExercises` 输出的 `candidateSet` MUST 记录规范化查询输入、已执行过滤、合法候选证明和 diagnostics。
- `generateRoutineDraft`、`generatePlanDraft`、`proposeWorkoutPatch` 和对应 validator MUST 继承并校验候选集合的查询边界，不能从全量动作库补入越界动作。
- 对所有 Agent tools 做能力审计：检索类、候选消费类、生成类、校验类、Policy 类、保存类和澄清类必须分别说明严格执行边界。

## Capabilities

### New Capabilities

- `agent-tool-capability-contract`: 定义 Tool-first 架构中每个 Agent tool 的能力声明、输入合同、严格执行、拒绝条件和执行证据。

### Modified Capabilities

- `rag-hybrid-search`: 将 `searchExercises` 的执行型候选检索要求从“结构化字段参与过滤”收紧为“受控结构化查询执行器 + 查询证据”。
- `readonly-llm-tool-calling`: 调整 Agent 读工具合同，要求读工具按 exact read、list、structured search、memory query 等能力类型暴露明确输入边界、拒绝条件和结果证据。
- `chat-routine-composition`: routine 生成和补动作必须继承本轮动作查询边界，不得用全量动作库补入不满足查询条件的动作。
- `workout-generation-validation-recovery`: 训练生成校验失败中的查询边界违反必须进入可恢复失败或阻断，不能被 warning 化后继续保存。
- `workout-validation-boundary`: 将“候选集合查询边界”和“用户明确结构化约束被违反”列入确定性 hard fail，且仍禁止服务端从用户原文做语义重判。

## Impact

- 影响 `lib/server/agent-orchestrator/tool-registry.ts` 或等价 registry 定义，需要为每个 tool 增加能力类型、输入合同、执行合同、拒绝条件、证据输出和不支持语义说明。
- 影响 `lib/server/agent-orchestrator/readonly-tools.ts` 中 `searchExercisesAgentToolInputSchema`、工具说明、工具执行和 diagnostics。
- 影响 `lib/server/exercises/exercise-service.ts` 中动作检索输入规范化、hard filter、facet 校验和候选证明。
- 影响 `lib/server/agent-orchestrator/workout-tools.ts` 中 `generateRoutineDraft`、`generatePlanDraft`、`proposeWorkoutPatch` 对 candidate set 的依赖校验和补动作边界。
- 影响 `lib/server/workout-plans/workout-plan-validation-service.ts`、`lib/server/workout-patches/workout-patch-engine.ts` 或等价校验层，用于验证最终 draft / patch 没有越过本轮查询边界。
- 影响 `searchArtifacts`、`getUserMemory` 等读工具的能力说明和参数边界；如现有参数无法严格执行 LLM 可能提出的操作，必须收窄描述、补结构化参数或返回不支持。
- 影响 Agent trace / 黑盒报告中的工具 diagnostics 展示，用于说明执行型候选集合按哪些结构化字段过滤、哪些字段无效、候选是否满足查询证明。
- 需要补充单元测试、Agent 工具测试和真实模型黑盒用例，覆盖每类 tool 的严格执行、拒绝条件、执行证据，以及无器械、器械要求、风险排除、难度、section、routine 补动作和 patch 替换等场景。
