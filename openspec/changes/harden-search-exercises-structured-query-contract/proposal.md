## Why

最新 AI Trace 中，用户要求“换一套没有器械的”，LLM 已经理解要查无器械上肢 routine，但 `searchExercises` 仍返回固定器械、杠铃、壶铃和绳索器械动作。根因不是单个词识别失败，而是 `searchExercises` 仍是半自然语言混合检索工具：LLM 需要临时拼底层过滤字段，服务端没有把这些字段作为严格、可证明、可被后续工具继承的结构化查询合同。

这个问题会影响所有依赖动作候选集合的语义约束，例如器械、训练地点、难度、风险标签、训练阶段、目标肌群和候选用途；只修“无器械”会继续留下同类问题。

## What Changes

- 将 `searchExercises` 从“query + 少量结构化字段”的半自然语言检索收紧为受控结构化动作查询执行器。
- LLM 仍负责决定要查哪些结构化查询字段；服务端不读取用户原文做关键词判断，也不改写 LLM 的高层语义。
- `searchExercises` MUST 只接受白名单过滤字段、合法枚举和动作库真实 facet；执行型候选集合必须按这些字段做确定性 hard filter。
- `query` 只能作为召回或排序信号，不能承载执行型 hard constraint；当结构化查询字段不足以表达执行候选边界时，工具必须返回可恢复结构化失败。
- `searchExercises` 输出的 `candidateSet` MUST 记录规范化查询输入、已执行过滤、合法候选证明和 diagnostics。
- `generateRoutineDraft`、`generatePlanDraft`、`proposeWorkoutPatch` 和对应 validator MUST 继承并校验候选集合的查询边界，不能从全量动作库补入越界动作。
- 明确其它工具的同类风险：`searchArtifacts` 也属于候选集合检索工具，但本 change 只做审计和边界说明，不改变 artifact search 行为；按 ID 读取或保存类工具不属于本次主要风险面。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `rag-hybrid-search`: 将 `searchExercises` 的执行型候选检索要求从“结构化字段参与过滤”收紧为“受控结构化查询执行器 + 查询证据”。
- `readonly-llm-tool-calling`: 调整 Agent 读工具合同，要求执行型动作候选工具暴露明确的结构化输入边界、合法 facet 诊断和候选集合查询证据。
- `chat-routine-composition`: routine 生成和补动作必须继承本轮动作查询边界，不得用全量动作库补入不满足查询条件的动作。
- `workout-generation-validation-recovery`: 训练生成校验失败中的查询边界违反必须进入可恢复失败或阻断，不能被 warning 化后继续保存。
- `workout-validation-boundary`: 将“候选集合查询边界”和“用户明确结构化约束被违反”列入确定性 hard fail，且仍禁止服务端从用户原文做语义重判。

## Impact

- 影响 `lib/server/agent-orchestrator/readonly-tools.ts` 中 `searchExercisesAgentToolInputSchema`、工具说明、工具执行和 diagnostics。
- 影响 `lib/server/exercises/exercise-service.ts` 中动作检索输入规范化、hard filter、facet 校验和候选证明。
- 影响 `lib/server/agent-orchestrator/workout-tools.ts` 中 `generateRoutineDraft`、`generatePlanDraft`、`proposeWorkoutPatch` 对 candidate set 的依赖校验和补动作边界。
- 影响 `lib/server/workout-plans/workout-plan-validation-service.ts`、`lib/server/workout-patches/workout-patch-engine.ts` 或等价校验层，用于验证最终 draft / patch 没有越过本轮查询边界。
- 影响 Agent trace / 黑盒报告中的工具 diagnostics 展示，用于说明执行型候选集合按哪些结构化字段过滤、哪些字段无效、候选是否满足查询证明。
- 需要补充单元测试、Agent 工具测试和真实模型黑盒用例，覆盖无器械、器械要求、风险排除、难度、section、routine 补动作和 patch 替换等场景。
