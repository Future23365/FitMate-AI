## Context

最新导出的 `codex_logs/ai_trace_log.js` 显示：

- `Saved at: 2026-06-14 14:01:25 +08:00`
- `title: 今天我要减肥，想多练练核心，有没有推荐的动作`
- Planner 连续 3 次选择 `searchExerciseResources`；第 3 次触发 `tool_consecutive_call_limit_exceeded`
- 前两次成功结果已经进入模型上下文，且模型可见 summary 包含 `returnedCount`、`truncated`、`excludedCount`、`query.candidateCountPerSection`、`sort`、`querySpecificity`、`filterSemantics`、`positiveAnchorBoundary`、`refreshExclusionBoundary`、`appliedFilters`、`filterApplicationBoundary`、`filterApplications`、`candidateGroups[].returnedCount`、`candidateGroups[].truncated`、`candidateGroups[].zeroMatchMuscles`
- trace summary 还包含 `totalMatches` 和 `candidateGroups[].totalMatches`，这些字段对开发排障有价值，但不应作为 Planner 下一步决策事实

`simplify-exercise-resource-search-output` 已经把旧 `groups` / `allowedSections` / section coverage 输出收敛到 `candidateGroups[]`，但仍保留了大量执行诊断和统计字段。实际 trace 说明：只删除 section coverage 不够，模型仍会把“还有更多命中 / 当前结果被截断 / 当前查询还能继续细化”理解为继续调用同一 tool 的信号。

本 change 的抽象问题类型是：**tool result summary 混入了执行诊断、预算回显和继续查询暗示，导致 Planner 在已有候选事实可供选择时继续查询**。

## Goals / Non-Goals

**Goals:**

- 让 `searchExerciseResources` 的 Planner-visible summary 只表达候选事实、当前查询口径和中性诊断。
- 从 Planner-visible summary 中删除会诱导继续查询的统计、截断、预算、过滤执行、边界说明和过宽诊断字段。
- 保留 trace / user projection / internal output 中的调试统计，避免削弱排障能力。
- 用 contract gate 测试禁止误导字段回流到 `projection.model` / `modelVisibleSummary`。
- 不引入服务端自然语言判断、关键词规则、固定短句特判或 `toolName` runtime 分支。

**Non-Goals:**

- 不调整 LangChain runtime 的连续 tool call 上限、模型调用预算、graph step 或 terminal failure finalizer。
- 不改变 `searchExerciseResources` 的数据库查询能力、候选均衡策略、输入 schema 或 repository 查询下推。
- 不删除 trace summary、user projection 或内部 handler output 里的开发调试字段。
- 不新增“当用户说某句话时必须怎样调用 tool”的 prompt 规则。
- 不让服务端根据用户原文替模型选择器械、肌群、场地或下一步 tool。

## Decisions

### 1. Planner-visible summary 采用候选事实白名单

`toModelVisibleSummary()` 使用白名单投影，而不是从完整 handler output 中删除少数字段。保留字段以“模型能基于候选事实继续推理、选择动作或进入全局停止条件判断”为标准：

- 保留：`status`、`factLevel`、必要的 `query` 语义过滤值、`candidateGroups[].suitability`、`candidateGroups[].exercises[]`、候选动作的有限事实字段、少量中性 `diagnostics[]`
- 删除：精确匹配数量、返回数量、截断标记、候选预算回显、排序、过滤执行细节、数据库 hard filter 说明、正向锚点边界、刷新排除边界、section coverage 和任何下一步行为暗示

替代方案是保留现有字段并在 prompt 中解释“不要因为 `truncated` 继续查”。这会把执行策略寄托在模型遵循说明上，而且日志已经证明解释性边界文本本身也会进入循环诱导源，因此不采用。

### 2. 诊断只表达用户可恢复事实，不表达查询还能继续

模型可见 `diagnostics[]` 只保留三类事实：

- 当前查询无候选，需要澄清或放宽条件
- 点名动作或受控 id 无法纳入，需要解释或澄清
- 输入约束冲突，需要模型基于当前上下文修正

诊断不得包含 `totalMatches`、`returnedCount`、`truncated`，也不得使用 `exercise_name_too_broad`、`too_broad` 等会暗示“继续扩大候选”的 code。内部 code 可以继续保留在 trace / user projection 中；Planner-visible summary 需要映射成中性 code 或直接省略。

`diagnostics[]` 不表达 sufficiency / readiness / completion。它只能描述本次查询的事实状态或可恢复阻断原因，不能给出“已经足够”“还不够”“可以交付”“必须继续查询”这类业务目标判断。是否直接回答、追问、继续调用 tool 或提交结构化终态，由 Planner 基于全局停止条件、候选事实和 finalization 合同自行决定。

### 3. Debug 字段保留在非 Planner 通道

以下字段对开发者排障有价值，但不能进入下一轮 Planner 输入：

| 字段或字段族 | Planner-visible summary | trace / user projection / internal output |
| --- | --- | --- |
| `totalMatches`、`returnedCount`、`truncated`、`excludedCount` | 删除 | 保留 |
| `candidateCountPerSection`、`sort`、`maxReturned`、`limit`、`take`、`offset`、`page`、`pageSize`、`cursor` | 删除 | 可保留执行摘要 |
| `querySpecificity`、`filterSemantics`、`appliedFilters`、`filterApplications`、`filterApplicationBoundary` | 删除 | 保留 |
| `positiveAnchorBoundary`、`refreshExclusionBoundary` | 删除 | 保留 |
| `candidateGroups[].totalMatches`、`candidateGroups[].returnedCount`、`candidateGroups[].truncated`、`candidateGroups[].zeroMatchMuscles` | 删除 | 保留 |
| `diagnostics[].totalMatches`、`diagnostics[].returnedCount`、`exercise_name_too_broad`、`too_broad` | 删除或映射为中性诊断 | 保留原始诊断 |
| `sectionSummary`、`availableSections`、`missingSections`、`allowedSectionsRelation`、`groupSemantics` | 删除 | 如需复盘可保留在非 Planner 摘要 |

### 4. Contract gate 递归扫描模型可见结果

测试不应只断言顶层字段。`model-visible-contract-gate` 需要递归扫描 `projection.model` / `modelVisibleSummary`，覆盖嵌套 `query`、`diagnostics`、`candidateGroups[]` 和字符串化 JSON。这样可以防止未来把字段从顶层移到嵌套对象后重新泄漏。

### 5. 不用 runtime loop 策略掩盖工具摘要问题

连续 tool call limit 是安全熔断，不是根因修复。即使第 3 次失败能正确收口，如果前两次模型上下文仍包含误导字段，模型仍会在熔断前浪费调用和 token。本 change 只处理 `searchExerciseResources` 的模型可见输入污染，runtime 终止策略由其他 change 负责。

## Risks / Trade-offs

- 精确数量从 Planner-visible summary 移除后，模型不能直接回答“库里一共有多少个匹配动作”。缓解方式：本 tool 的当前主要职责是动作候选查询；若未来需要精确统计，应新增或扩展专用只读统计合同，而不是把执行统计混入候选 summary。
- 删除 `truncated` 后，模型少了“结果不是全集”的显式提示。缓解方式：候选推荐和训练方案生成只需要有限候选事实；全库未返回数量属于调试信息，不应驱动继续查。
- 删除 `filterSemantics` 后，模型少了数据库映射解释。缓解方式：稳定输入语义应写在 tool description / schema description / `facetCatalog` 中，不应每次作为 tool result 执行诊断重复注入。
- 递归黑名单可能误伤 trace 或 user projection 测试。缓解方式：测试只作用于 Planner-visible summary，不扫描完整 handler output、trace summary 或 user projection。

## Migration Plan

1. 调整 `searchExerciseResources` 的 model-visible projection，改为候选事实白名单。
2. 保留内部 output、trace summary 和 user projection 的统计字段。
3. 更新 tool description / schema description 中关于候选数量和诊断边界的说明，避免承诺模型可见 summary 会提供精确匹配数量。
4. 补充 `searchExerciseResources` 单测，覆盖成功候选、空候选、名称歧义、被截断内部结果和 trace 保留。
5. 补充 `model-visible-contract-gate`，递归断言误导字段不出现在 Planner-visible summary。
6. 运行 OpenSpec validation、相关 tool tests 和 typecheck。

## Open Questions

无。当前决策是先删除 Planner-visible summary 中的误导字段；如果后续需要“精确动作数量查询”，另行设计专用统计能力。
