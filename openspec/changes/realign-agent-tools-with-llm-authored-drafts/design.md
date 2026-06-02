## Context

Tool-first Agent 主链的目标是：LLM 通过工具读取事实、检索候选、提交结构化训练草稿、请求校验和保存；服务端只执行工具、校验确定性边界、登记资源和持久化结果。

当前实现中，读工具、validation、policy 和 persistence 基本符合这个边界；但训练生成工具已经漂移：

- `generateRoutineDraft` 只接收 `candidateExerciseIds`，服务端用 `buildRoutineDraftFromCandidates()` 自行决定 section、执行参数和缺失阶段补齐。
- `generatePlanDraft` 只接收 `strategy` 和候选动作，服务端用 `DomainPlanEngine.expandDomainPlan()` 自行展开完整 plan draft。
- `DomainPlanEngine.buildPlanStrategyFromWorkoutIntent()` 仍包含基于 `latestUserMessage` 的正则推断，属于服务端解释自然语言语义。
- `searchExercises` 当前混入 `candidateUse`、`resultRequirements`、`sectionCoverage`、`satisfied` 等生成前置字段，导致一个查动作工具承担了编排层职责。
- `searchArtifacts` 当前混入 `candidateUse`，也把“结果后续用于什么”放进了搜索工具。

## Goals / Non-Goals

**Goals:**

- 建立完整 Agent Tool 合同审计文档，允许人工逐项检查每个 Tool 的输入、执行内容、返回结果和禁止行为。
- 将搜索类 Tool 收敛为纯读取 / 纯搜索工具，移除候选用途、覆盖要求和生成前置状态。
- 将 `generateRoutineDraft` 从服务端编排器改为 LLM-authored routine draft 登记工具。
- 将 `generatePlanDraft` 从服务端计划生成器改为 LLM-authored plan draft 登记工具。
- 保留服务端对搜索结果来源、动作 ID、权限、器械 hard constraints、三段结构、时长范围、Policy 和保存边界的确定性校验。
- 将 `DomainPlanEngine` 收缩为确定性 schedule / calendar 展开、一致性校验或后续导入辅助，而不是生产链路的语义生成器。
- 确保 trace 和黑盒报告能看出每个 Tool 的输入、资源引用、output 和执行边界。

**Non-Goals:**

- 不绕过 OpenSpec 直接改实现。
- 不新增数据库表、Prisma migration 或动作库数据。
- 不改变前端视觉布局。
- 不允许服务端使用关键词、正则、同义词表或自然语言模板解释用户意图。
- 不要求 LLM 复写已保存 artifact 的完整 payload；可继续通过 resource id 引用本轮已登记资源。

## Decisions

### 1. 搜索类 Tool 必须退回纯搜索

`searchExercises` 的目标输入从：

```ts
{
  operation: "build_exercise_candidate_set",
  candidateUse: "routine",
  filters,
  resultRequirements: {
    minCandidates,
    sectionCoverage
  }
}
```

改为纯动作搜索：

```ts
{
  query?: string,
  filters?: ExerciseSearchFilters,
  limit?: number,
  projection?: Projection
}
```

目标输出从生成候选集合状态：

```ts
{
  candidateSetId,
  candidateUse,
  satisfied,
  resultRequirementProof,
  candidates
}
```

改为纯搜索结果：

```ts
{
  exerciseSearchResultId,
  exercises,
  appliedFilters,
  diagnostics
}
```

热身 / 拉伸默认无器械不再通过 `sectionCoverage` 或 routine 候选池表达。正确方式是：

- LLM 为热身单独调用 `searchExercises({ filters: { allowedSections: ["warmup"], homeRequirements: ["no_equipment"] } })`；
- LLM 为拉伸单独调用 `searchExercises({ filters: { allowedSections: ["stretch"], homeRequirements: ["no_equipment"] } })`；
- 如果用户没有明确要求器械热身 / 器械拉伸，Tool 可在 `allowedSections` 只包含 `warmup` 或只包含 `stretch` 时确定性补入 no-equipment 过滤；
- 最终哪些动作进入 warmup / training / stretch 只能出现在 LLM-authored draft 中。

`searchArtifacts` 同理移除 `candidateUse`，只保留 query、filters、scope、limit、projection，返回 `artifactSearchResultId` 和 artifact 摘要。

### 2. 生成类 Tool 改为登记 LLM-authored draft

`generateRoutineDraft` 的目标输入从：

```ts
{ intent, candidateSetId, candidateExerciseIds, title? }
```

改为接收 LLM 输出的结构化 routine draft，例如：

```ts
{
  draft: WorkoutRoutineDraft,
  exerciseSourceIds: string[],
  sourceArtifactPayloadId?: string,
  sourceEditPlanId?: string,
  requirements?: RoutineRequirements
}
```

服务端只做：

- `draft` schema parse；
- 从 `exerciseSourceIds` 恢复 LLM 本轮看过的 exerciseId；
- `draft.sections[].items[].exerciseId` 来自允许动作来源或 source artifact；
- required artifact 动作覆盖；
- 确定性 validation；
- 登记 `draftId` 和安全摘要。

`generatePlanDraft` 同理接收 LLM-authored `WorkoutPlanDraft`，不再调用服务端生成完整 plan。

### 3. `DomainPlanEngine` 降级

`DomainPlanEngine` 保留的合理职责：

- 根据 LLM-authored plan 生成 schedule preview 或 calendar preview；
- 校验 plan 元数据与 structured strategy 是否一致；
- 导入或展开日历时做确定性日期计算。

禁止职责：

- 根据 `latestUserMessage` 正则推断周期、周频率、强度、策略或约束；
- 根据 source routine 自动生成完整 plan draft；
- 根据候选动作自动决定计划日内容。

### 4. Tool 合同文档先于实现

本 change 必须先完成 `tool-contract-audit.md`。实现前需要逐个确认所有 Tool：

- 输入字段；
- 依赖资源；
- 执行内容；
- 返回资源；
- 失败条件；
- 禁止行为；
- 是否存在服务端语义生成风险。

后续实现必须以该审计文档为准，而不是靠 prompt 口头约束。

### 5. Resource contract 继续保留

让 LLM 输出完整 draft 并不等于让 LLM 保存任意 payload。服务端仍要把 search result、draft、patch、validation 和 policy 登记为本轮资源，后续工具只能通过 `exerciseSearchResultId` / `artifactPayloadId` / `draftId` / `patchId` / `validationId` / `policyDecisionId` / `revisionId` 消费，保持当前资源合同优点。

## Risks / Trade-offs

- [Risk] LLM-authored draft 会增大单次模型输出。→ Mitigation: 搜索工具给模型的候选摘要保持白名单字段，draft schema 只要求保存所需字段，不回填展示噪音。
- [Risk] 模型可能输出未搜索或不可见动作。→ Mitigation: `registerRoutineDraft` / `registerPlanDraft` 必须根据 `exerciseSourceIds` hard fail，并提供可恢复诊断。
- [Risk] LLM 需要多次调用 `searchExercises`。→ Mitigation: 接受热身、主训练、拉伸分开搜索；Tool 调用次数增加优先于职责混杂。
- [Risk] 移除服务端生成器后短期通过率下降。→ Mitigation: 通过 prompt、tool schema、repair loop 和 validation recovery 让 LLM 修复结构化草稿，而不是服务端补写语义。
- [Risk] 现有测试依赖服务端自动编排。→ Mitigation: 先改测试 fixture，让测试输入包含 LLM-authored draft，再删除旧期望。
- [Risk] `section-aware-routine-candidate-pools` 已存在且方向不完全正确。→ Mitigation: 本 change 明确废弃“section pool / coverage proof 驱动生成”的方向；热身 / 拉伸默认无器械改由纯搜索 filters 和 validator 约束表达。

## Migration Plan

1. 完成并人工审核 `tool-contract-audit.md`。
2. 修改 OpenSpec delta specs，明确搜索工具必须纯搜索、生成工具必须接收 LLM-authored draft。
3. 调整 `searchExercises` / `searchArtifacts` schema，移除候选用途和覆盖要求。
4. 调整 `generateRoutineDraftAgentToolInputSchema` 和 `generatePlanDraftAgentToolInputSchema`，目标语义收敛为 register draft。
5. 修改工具实现：从“生成 draft”改为“解析、校验、登记 draft”。
6. 调整 patch、validation、policy、save 工具字段，统一通过 resource id 消费资源，不接收 raw payload 或模型自报状态。
7. 移除 `buildRoutineDraftFromCandidates()` 生产使用路径；必要时只保留测试 fixture helper。
8. 移除 `generatePlanDraft` 对 `expandDomainPlan()` 生成完整 plan 的生产依赖。
9. 收缩 `DomainPlanEngine`，删除或隔离自然语言正则推断生产入口。
10. 更新 prompt 和 tool summary，要求 LLM 分别搜索热身、主训练、拉伸，并在登记工具输入中提交完整 structured draft。
11. 补充工具合同测试、LLM repair 测试、黑盒 flow 测试。
12. 运行相关自动化测试、`npm run typecheck` 和 OpenSpec 严格校验。

## Open Questions

无。该 change 的首要任务是让你逐项审核 Tool 合同；实现前如果你要求调整某个 Tool 的输入或返回结构，应先更新本 change 文档。
