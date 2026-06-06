## Context

`searchExerciseResources` 是 production Agent 的只读发布态动作库事实查询 tool。它目前按 `suitabilities` 拆分 section 后调用 repository 查询，并把每个 section 的动作事实汇总到 `groups.<section>.exercises[]`。现有合同强调结构化数据库 facet 必须下推查询，避免全量读取、隐藏区域展开或服务端自然语言判断。

本次问题暴露的是 support section 与主训练动作共用同一套 hard filters 的边界不合理。主训练动作可以要求难度、动作力学、分类、训练标签等更细约束；但热身 / 拉伸动作更像训练结构中的支持段落，核心边界通常是发布态、section、器械、场地和目标部位。如果把 `level = "intermediate"` 等主训练强度字段也作为热身 / 拉伸 hard filter，数据库中存在可用 support 动作时仍可能查空。

本 change 不是语义检索 change，也不是 prompt 规则 change。它只调整已有 tool 的执行合同，并把实际执行口径结构化投影给 Planner。Planner 仍负责根据用户需求自主选择 tool input、继续查询、澄清或输出最终结构。

## Goals / Non-Goals

**Goals:**

- 为 `searchExerciseResources` 增加 section-aware hard filter policy。
- 保持 `training` 查询的严格结构化过滤能力。
- 让 `warmup` / `stretch` 查询以 support section 可用性为主，避免被不适合作为 support hard filter 的字段查空。
- 在 output、model observation 和 trace summary 中暴露 `filterApplications` 或等价结构，说明每个 section 实际应用了哪些 hard filters，以及哪些 Planner 输入没有作为 hard filter 使用。
- 保持数据库下推查询，不回到全表读取后内存过滤。
- 保持 Agent core、production route、Policy Guard、Response Renderer 和用户自然语言处理链路不变。

**Non-Goals:**

- 不新增 pgvector、RAG、向量字段、embedding 回填或语义排序。
- 不修改 `stage-exercise-semantic-retrieval` 的分阶段边界。
- 不新增 `warmupTarget`、`stretchTarget`、`supportSectionTarget` 或自然语言意图 enum。
- 不从用户原文、`q`、历史摘要或自然语言短语中解析 hidden filters。
- 不让服务端在查空后自动重试、自动放宽器械、自动换肌群或自动决定下一步 tool 调用。
- 不让 `searchExerciseResources` 生成 routine、plan、训练卡片、保存事件或 candidate set resource。

## Decisions

### 1. 按 section 决定 hard filter policy

repository 查询入口继续以单个 section / suitability 为单位构造数据库查询。每次构造 where 时先得到 `filterPolicy`：

- `training` 使用 `training` policy。
- `warmup` 和 `stretch` 使用 `support_section` policy。

`training` policy 继续应用当前结构化字段：`published`、`suitability`、`equipment`、`homeRequirement`、`muscle` / `muscles`、`level`、`force`、`mechanic`、`category`、`goalTag`、`riskTag`、`q`、`requiredExerciseIds` 和 `excludeExerciseIds`。

`support_section` policy 只应用：`published`、`suitability`、`equipment`、`homeRequirement`、`muscle` / `muscles`、`requiredExerciseIds` 和 `excludeExerciseIds`。如果 Planner 传入 `level`、`force`、`mechanic`、`category`、`goalTag`、`riskTag` 或 `q`，repository 不把它们放入 support section 的 `where`。

取舍：这会让 support section 查询比主训练更宽，但宽度仍由结构化数据库事实约束，不读取用户原文，也不取消器械、场地和目标部位边界。

### 2. 结构化披露执行边界，不返回自然语言解释句

tool output 增加 `query.filterApplications`，每项对应一个 section 查询：

```json
{
  "section": "warmup",
  "policy": "support_section",
  "appliedHardFilters": ["published", "suitabilities", "equipment", "muscles"],
  "unappliedInputFilters": [
    {
      "field": "level",
      "value": "intermediate",
      "code": "not_used_for_support_section"
    }
  ]
}
```

这里不使用 `resultBoundary` 之类自由文本字段。`code` 是稳定机器可读枚举，模型可见说明只解释这些字段含义，不把某句自然语言写死成服务端语义提示。

取舍：Planner 能看到热身 / 拉伸结果并未声明满足 `level` 等字段，但不会被服务端提示“下一步应该重查”。是否接受这些事实、继续查、澄清或失败收口仍由 Planner 决定。

### 3. `appliedFilters` 保留兼容语义，但不再足以表达 section 差异

现有 `appliedFilters` 可继续作为整体查询摘要存在，但它不能表达同一次调用里 `training` 与 `warmup` / `stretch` 分别采用不同 policy 的事实。实现应新增 `filterApplications`，并在模型 observation 和 trace 中优先投影该字段。

如果实现保留 `appliedFilters`，必须避免让它误导 Planner 认为某个输入字段对所有 section 都被应用。对于混合查询，`appliedFilters` 只能表示全局输入摘要或共同硬约束；section 级真实执行口径以 `filterApplications` 为准。

### 4. required / exclude 仍然是 hard filters

`requiredExerciseIds` 是由模型基于可见事实或点名解析结果传入的正向锚点，`excludeExerciseIds` 是负向排除约束。两者都属于明确结构化输入，必须在 training 和 support section 中保持 hard filter 语义。若 required 动作与 section、器械或目标部位不兼容，仍通过 diagnostics 暴露冲突，不靠服务端自然语言判断是否放弃。

### 5. 模型可见合同只说明字段含义，不增加调用规则

如果本 change 更新 manifest、schema description 或 observation，说明应限定为：

- `filterApplications` 是 tool 实际执行摘要。
- `appliedHardFilters` 是该 section 已作为数据库 hard filter 使用的输入字段。
- `unappliedInputFilters` 是 Planner 传入但该 section policy 未作为 hard filter 使用的字段。
- `support_section` policy 适用于 `warmup` / `stretch` 查询。

说明不得写成“当用户说胸部热身时必须如何传参”，也不得要求固定下一步 tool 调用。

## Risks / Trade-offs

- Risk: 用户明确想要“只要高级拉伸动作”时，`support_section` 不把 `level` 当 hard filter，返回动作不能声明满足该难度。Mitigation：通过 `filterApplications.unappliedInputFilters` 暴露事实边界；后续若要支持 support section 强制难度，应单独设计明确字段或重新定义 `level` 语义。
- Risk: 混合查询里 `appliedFilters` 与 section 级执行口径产生歧义。Mitigation：新增 `filterApplications`，并要求 observation / trace 使用 section 级摘要作为真实执行依据。
- Risk: 实现时把 support section policy 写成查空后的 fallback。Mitigation：spec 要求 policy 在构造 where 前确定，不以查询结果、用户原文或查空状态为触发条件。
- Risk: 过度放宽 support section 查询导致返回过多候选。Mitigation：继续保留 section、发布态、器械、场地和肌群 hard filters，并沿用每 section 的 `maxReturned` 上限和排序规则。

## Migration Plan

1. 更新 OpenSpec spec，明确 section-aware hard filter policy、`filterApplications` 输出和禁止边界。
2. 更新 `searchExerciseResources` output schema、handler 汇总逻辑、model observation、trace summary 和 tests。
3. 更新 repository 的 where 构造和 applied filter 收集逻辑，让 policy 在查询前确定。
4. 更新 manifest / schema summary 测试，如模型可见说明因新增字段而变化。
5. 运行 `openspec validate harden-exercise-support-section-query-policy --strict` 和相关 tool-level / contract tests。

回滚策略：如果 support section policy 召回质量不符合预期，可回退 repository policy 和 output schema 新字段；这不影响 `stage-exercise-semantic-retrieval` 的向量基础设施 change。

## Open Questions

无。
