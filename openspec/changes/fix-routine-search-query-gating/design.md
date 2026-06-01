## Context

动作搜索当前流程是：先执行结构化 hard filters，再对过滤后的候选做全文 / 向量 / business score 排序。这个设计本身正确，但当前实现对任何带 `query` 的搜索都会要求 hybrid score 大于 0，否则从 ranked 中剔除。

routine / plan 编排与普通问答搜索不同。模型已经通过 `candidateUse`、`bodyRegions`、`equipmentRequired`、`allowedSections`、`sessionMinutes` 等字段表达了可执行候选边界。此时 `query="上肢训练"` 这类泛化短语不是动作库真实 facet，也不一定出现在单个动作 embedding text 里；如果继续把它当硬召回条件，会把结构化候选集清空。

## Goals / Non-Goals

**Goals:**
- 让 routine / plan 搜索在结构化过滤已有候选时不被泛化 query 清空。
- 保持结构化 hard filters 的优先级和权限 / 发布态边界不变。
- 保留 recommendation、answer_only、patch 搜索的 query 召回约束。
- 增加测试覆盖这次真实 trace 的候选搜索形态。

**Non-Goals:**
- 不新增服务端自然语言意图纠偏，不根据用户原文重写语义。
- 不改变动作库 metadata、embedding 算法或候选排序服务的整体架构。
- 不放宽 published、equipment、bodyRegions、allowedSections 等 hard filters。

## Decisions

1. 为 `ExerciseSearchInput` 显式保留 `candidateUse`。

   Agent 已经把 `candidateUse` 传给 `searchExercises`，但 exercise service 类型没有把它作为正式输入字段。将其纳入输入合同后，搜索服务可以只针对 `routine` / `plan` 调整 query 召回门控，而不影响推荐和普通检索。

2. routine / plan 且存在结构化候选边界时，query 不作为硬召回过滤。

   对 `candidateUse="routine"` 或 `candidateUse="plan"`，如果请求包含 `bodyRegions`、`targetMuscles`、`equipmentRequired`、`equipment`、`allowedSections`、`goal` 或 `sessionMinutes` 等结构化边界，则搜索使用结构化过滤后的候选继续排序，不再要求 query hybrid score 大于 0。

   备选方案是在 Agent prompt 中要求不要传 `query`。该方案不稳定，且模型仍可能根据工具 schema 传入泛化 query；搜索服务应保证结构化候选边界才是可执行编排的事实来源。

3. 失败原因按实际召回门控记录。

   当 query 不作为硬召回过滤时，如果仍没有候选，应返回 `no_exercise_after_filters` 或结构化 facet 相关原因，而不是 `no_hybrid_match`。这样 trace 能准确表达是 hard filter 为空，而不是 query 召回为空。

## Risks / Trade-offs

- [Risk] routine / plan 搜索会返回与 query 文本不强相关的候选。→ 仅在有结构化候选边界时放宽，动作仍受 bodyRegions、equipment、allowedSections、published 等硬过滤限制。
- [Risk] 影响推荐搜索质量。→ 只对 `routine` / `plan` 生效，`recommendation` 仍保留 query 召回约束。
- [Risk] 类型字段被其他调用方误用。→ `candidateUse` 默认可省略，未传时保持现有行为。
