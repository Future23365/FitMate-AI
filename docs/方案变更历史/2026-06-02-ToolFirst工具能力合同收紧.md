# Tool-first 工具能力合同收紧

时间：2026-06-02 17:43:46 CST

## 当前真实问题

Tool-first Agent 已经能调用 `searchExercises -> generateRoutineDraft -> validateRoutineDraft -> saveConversationArtifactRevision`，但此前工具合同仍偏“能搜到候选”：模型可以把“没有器械”“指定阶段覆盖”“换动作必须来自候选集”等硬约束塞进 `query` 或自由字段里。服务端虽然能做结构校验，却没有统一证据证明“这个候选集合真的满足 ToolRequest”，下游生成工具也可能从全量动作库补动作，留下 hard boundary 被绕过的空间。

## 调整思路

把复杂工具统一升级为“能力合同 + 履约证据”模型。每个 tool 声明 `AgentToolCapabilityContract`，模型可见摘要、registry 校验、trace 和测试都从同一份合同读取。执行型 `searchExercises` 必须使用结构化 `operation`、`filters`、`resultRequirements` 和 `projection`；成功结果返回 `candidateSetEvidence` 与 `satisfied=true`，失败则返回稳定错误码和 diagnostics。

## 关键改动

- `AgentToolRegistry` 强制复杂 tool 提供 capability contract，并把 `toolRequestContractSummary` 暴露给模型。
- 新增 `ToolResult fulfillment`，记录 `satisfied`、产出资源、hard constraints、unmet result requirements 和 evidence。
- 新增 `resolveArtifactReference` 与 `queryUserMemory`，避免把候选搜索或 snapshot 假装成唯一引用解析和精确记忆查询。
- `searchExercises` 支持结构化 filters、result requirements、invalid facet 诊断、query mode 和 candidate set proof。
- `generateRoutineDraft`、`generatePlanDraft`、`proposeWorkoutPatch`、validator、policy 和保存链路只能消费当前 run 中 `satisfied=true` 的候选集合。
- 黑盒报告新增失败分类摘要，区分 LLM 参数错误、tool 能力不足、候选不足、result requirement 未满足、hard boundary 失败和保存失败。

## 为什么优于最小补丁

最小补丁只能继续在 `searchExercises` 或 prompt 里追加说明，仍无法证明模型传入的硬约束被工具执行过，也无法阻止下游生成工具跨候选集合补动作。新方案把合同、执行、trace、恢复和测试放到同一条证据链上：模型负责语义理解，服务端只校验结构化合同和资源边界，符合当前 AI 语义边界规则。

## 验证

- `npm test -- tests/exercise-service.test.ts tests/readonly-tools.test.ts tests/agent-orchestrator.test.ts tests/workout-plan-validation.test.ts tests/manual-llm-flow-policy.test.ts`
- 后续还需要运行全量 `npm test`、`npm run typecheck`、`openspec validate harden-search-exercises-structured-query-contract --strict`。
