## Context

当前生产 `/api/chat` 已进入新 `agent-core` 链路，模型通过 `LlmPlanner` 输出 `AgentAction`，可用 tool 主要提供当前 run 可见训练事实和发布态动作事实。`visibleTrainingProposal` 的 `routine` / `plan` 最终结构仍由模型在 `final_answer.visibleOutputs[]` 中生成，服务端通过业务 validator 校验 schema、section coverage、动作事实和数据库存在性。

2026-06-05 的失败 trace 证明：模型实际看到了 `missingSectionsForRoutineOrPlan = ["warmup","stretch"]`，也看到了可继续用 tool 查询缺失 section，但仍直接输出了不完整 `routine`。这说明当前可见合同已经暴露事实缺口，但没有把“缺 section 时禁止 final routine/plan”表达成足够硬的首轮生成前置条件。

本 change 使用 `agent-prompt-contract-governance` 作为主治理边界。它只修改模型实际可见输入，包括默认 prompt、业务 tool manifest / schema description / examples、observation 和兜底 repair feedback；不修改服务端语义分流、不新增训练生成服务、不恢复旧 draft tool。

## Goals / Non-Goals

**Goals:**

- 把 `routine` / `plan` 的 section readiness 从“建议补齐”收紧为模型可见的 final 前置条件。
- 让模型在缺少 `warmup` / `stretch` 时，在正常路径中优先继续获取缺失 section 事实，而不是先输出错误结构再依赖 repair。
- 明确禁止在 `missingSectionsForRoutineOrPlan` 非空时提交 `final_answer.visibleOutputs[]` 中的 `routine` / `plan`。
- 保持 AI 负责选择动作、处方和最终编排；服务端继续只做事实提供、结构校验和安全边界。
- 通过 prompt / manifest / observation / replay / 黑盒验证证明合同已进入模型实际可见输入。

**Non-Goals:**

- 不新增 `generatePlanDraft`、`generateRoutineDraft` 或等价服务端训练生成 tool。
- 不让服务端根据用户自然语言、关键词、短句模板或同义词表选择 tool、补动作或改写 `payload.kind`。
- 不修改 `/api/chat` route、Agent runtime 主循环、`PlannerPort`、Executor、Policy Guard、ResourceStore、Response Renderer。
- 不把 repair feedback 作为主要成功路径；repair 仅作为最后防线。
- 不改变 `searchExerciseResources` handler 的数据库查询语义、input / output schema 或动作候选返回结构。

## Decisions

### Decision 1: 只收紧模型可见合同，不下沉动作生成

动作选择、训练结构和处方继续由模型生成。服务端不新增 composition service，不根据结构缺口自动补 `warmup` / `stretch`，也不替模型挑选动作。

替代方案是新增服务端 composition gate 或生成 tool。该方案被排除，因为它会把“AI 生成动作和编排”的产品边界移到服务端，并引入新的业务编排能力，而当前问题更直接来自模型可见合同不够硬。

### Decision 2: 默认 prompt 写 final 前置条件，不写固定 toolName 流程

默认 prompt 应表达稳定结构规则：如果要输出 `payload.kind = "routine"` 或 `"plan"`，当前 run 必须已有 `warmup`、`training`、`stretch` 三类可消费动作事实；缺失时禁止输出对应 `visibleOutputs`。

默认 prompt 不写“必须调用 `searchExerciseResources`”这样的具体业务 tool 流程。具体 tool 的查询方式、`suitabilities` 和 `groups.<section>` 语义放在该 tool 的 manifest、schema description、examples 和 observation 中。

### Decision 3: `searchExerciseResources` observation 明确 forbidden final

当 `searchExerciseResources` 结果只覆盖部分 section 时，observation 必须用短、明确、可执行的方式表达：

- 当前结果覆盖哪些 section；
- 如果最终目标是 `routine` / `plan`，还缺哪些 section；
- 可用缺失 section 的 `suitabilities` 查询候选；
- 在缺口补齐前禁止提交 `routine` / `plan` 的 `visibleOutputs`。

这仍然是模型可见合同，不是 handler 代替模型判断用户目标，也不是固定 tool 调用次数或固定调用顺序。

### Decision 4: repair feedback 只同步同一合同

如果模型仍提交非法 `routine` / `plan`，validator 现有硬拦截继续生效。repair feedback 可以同步提示“不要再次提交缺 section 的 routine/plan；先获取缺失事实、ask_user 或不输出 visibleOutputs”，但它只作为兜底，不作为主方案。

## Risks / Trade-offs

- [Risk] 只改 prompt / observation 仍依赖真实模型遵守合同。  
  → Mitigation：补 prompt / manifest 快照、ReplayPlanner 场景和真实 LLM 黑盒回归；失败时再评估是否需要更强的结构化 planner feedback，但不先下沉服务端生成。

- [Risk] 文案过强可能让普通动作推荐也强行查询 `warmup` / `stretch`。  
  → Mitigation：合同只绑定“模型已经判断最终目标需要 `routine` 或 `plan`”以及“准备输出对应 visibleOutputs”的场景；`exercise_selection` 不要求补 section。

- [Risk] 默认 prompt 如果写具体 `toolName`，会违反通用 prompt 和业务 tool 边界。  
  → Mitigation：默认 prompt 写通用 final 前置条件；具体 `searchExerciseResources` 查询方式只写在 tool manifest / observation。

- [Risk] repair feedback 被误当成主要修复点。  
  → Mitigation：tasks 和测试优先覆盖首轮模型可见合同；repair 只作为兜底一致性检查。

## Migration Plan

1. 更新默认 Agent LLM prompt 的 `visibleTrainingProposal` section readiness 文案。
2. 更新 `searchExerciseResources` 的模型可见 manifest、schema description、examples 和 observation 文案。
3. 如需要，更新 `visibleTrainingProposal` validator 的兜底 recovery 文案，保持与主合同一致。
4. 补充 prompt / manifest / observation 快照或等价单测。
5. 补充 ReplayPlanner 回归：training-only facts 下，模型必须先补缺失 section 或选择 ask_user / 无 visibleOutputs 失败说明。
6. 在具备真实模型环境时运行当前失败 case 的黑盒回归。

回滚策略：如果真实模型黑盒显示过强合同导致普通动作推荐退化，可仅回退 prompt / manifest 文案，不涉及数据库、API、runtime 或持久化迁移。

## Open Questions

- 真实 LLM 黑盒验证是否在本 change 实现阶段消耗模型调用，还是只记录为手动验证项？
- 是否需要把 `section_coverage_missing` 的 repair 文案纳入本 change 实现，取决于首轮 prompt / observation 合同测试是否已经覆盖主要失败路径。
