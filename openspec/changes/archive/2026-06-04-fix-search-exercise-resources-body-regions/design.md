## Context

当前 `searchExerciseResources` 是生产文本聊天唯一注册的低风险只读业务 tool。它负责按结构化筛选字段查询发布态动作资源摘要，不负责训练生成、候选集合、卡片、保存或动作详情读取。

最新 trace 中，模型把“练腿”结构化为 `muscle: "腿部"`。这符合当前 schema 的自由字符串约束，却不符合数据库真实 facet：动作库的下肢动作以 `股四头肌`、`腘绳肌`、`臀部`、`小腿` 等具体肌群存储。旧 `searchExercises` 已通过 `bodyRegions` 解决过类似问题，但新只读 tool 没有继承这层合同。

任务分类：

- 主类型：Agent tool bug 修复。
- 模型可见合同类型：单个业务 tool 模型可见说明与 input schema。
- core contract 变更：不在范围内。
- production 接入变更：不在范围内，只保持现有 production registry 中的 tool 能力更正。

允许触碰模块：

- `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
- `lib/server/exercises/exercise-repository.ts`
- `lib/shared/exercises/**` 中与 `bodyRegions` 枚举复用直接相关的类型或 schema。
- `tests/agent-tools/search-exercise-resources.test.ts`
- `tests/agent-core/tool-registry-manifest.test.ts` 或等价 manifest/schema summary 测试。
- `docs/agent-tool-design.md` 和项目演变文档。

禁止触碰模块：

- Agent core Runtime 主循环、`PlannerPort`、Executor 主流程、`Policy Guard`、`Resource Contract Validator` 和 `Response Renderer`。
- `/api/chat` route 或 chat production 主链路。
- routine / plan / patch 候选集合、训练草稿生成、保存 artifact、用户记忆和写入确认链路。
- 任何服务端基于 latest user message、conversationSummary 或用户原文关键词改写 LLM 高层语义决策的逻辑。

## Goals / Non-Goals

**Goals:**

- 让 `searchExerciseResources` 能用 `bodyRegions: ["lower_body"]` 查询腿部/下肢动作，并返回真实发布态动作摘要。
- 让模型可见 schema、description、whenToUse 和 examples 明确：高层身体区域用 `bodyRegions`，真实肌群 facet 才用 `muscle`。
- 保持 repository 查询下推，不回退到旧 `searchExercises()` 或全表读取后内存过滤。
- 当具体筛选返回 0 时，tool output 仍表示查询执行成功，但 fulfillment 应标记为 `satisfied=false` 并给出结构化诊断摘要，用于模型重查、追问或解释。
- 补充 tool-level 回归测试，直接覆盖 `executeTool` 或真实 handler 边界。

**Non-Goals:**

- 不把 `searchExerciseResources` 改成 routine / plan / patch 的候选集合 builder。
- 不支持 `targetMuscles`、`candidateUse`、`resultRequirements`、`limit`、`page` 或其他消费侧字段。
- 不新增动作详情、动作库统计、唯一名称解析或训练卡片生成能力。
- 不新增服务端自然语言理解、关键词匹配、同义词表或基于用户原文的语义纠偏。
- 不新增数据库字段、Prisma migration、pgvector 查询、外部 embedding 调用或外部 Vector DB。

## Decisions

### Decision 1: 新增 `bodyRegions`，不把 `"腿部"` 当作真实 `muscle`

`searchExerciseResourcesInputSchema` 新增：

```ts
bodyRegions?: Array<"upper_body" | "lower_body" | "core" | "full_body">;
```

`muscle` 保持为单个真实肌群 facet 字符串，用于 `股四头肌`、`腘绳肌`、`臀部`、`胸部`、`肩部` 等数据库中存在的精确值。`bodyRegions` 用于用户表达高层区域时的结构化输入。

理由：这延续旧 `searchExercises` 的 facet 合同，避免让模型猜测数据库不存在的范围词，同时不需要服务端读取用户原文做语义判断。

备选方案：把 `"腿部"` 作为服务端 alias 自动改写。该方案会引入服务端自然语言语义归一化，且容易扩张为同义词表，放弃。

### Decision 2: 在 repository 层确定性展开枚举

repository 接收 `bodyRegions` 后，只根据枚举展开为真实肌群 facet：

- `upper_body` -> `胸部`、`肩部`、`背阔肌`、`中背部`、`下背部`、`肱二头肌`、`肱三头肌`
- `lower_body` -> `股四头肌`、`腘绳肌`、`臀部`、`小腿`
- `core` -> `腹肌`
- `full_body` -> 合并以上区域

展开结果必须和显式 `muscle` 合并为 OR 查询，并写入 `expandedMuscles` 或等价 query summary / projection / trace 字段。展开函数只接收结构化枚举和可选可用 facet 集合，不接收自然语言文本。

理由：服务端执行结构化枚举是确定性合同，不是自然语言语义判断；同时 Prisma `where` 仍可以下推到数组 `has` 条件。

备选方案：让模型一次传多个 `muscle` 字段。当前 tool 设计中 `muscle` 是单值，改成多值会扩大真实 facet 输入面；本次只为高层区域新增受控枚举，范围更窄。

### Decision 3: 空结果不再无条件 `satisfied=true`

handler output 仍保持 `status: "succeeded"`，因为数据库查询确实成功执行；但 `toFulfillment` 应基于 `totalMatches` 和具体筛选判断：

- `totalMatches > 0`：`satisfied=true`。
- `totalMatches = 0` 且存在 `bodyRegions`、`muscle`、`equipment`、`category`、`suitability`、`level` 等具体筛选：`satisfied=false`，summary 说明“查询成功但没有满足当前筛选条件的动作”。
- 无具体筛选但全库发布态为空：仍可 `satisfied=false`，说明发布态动作库为空。

模型可以用 unsatisfied result 做失败解释、追问或下一轮重查，但不能把它当成成功推荐结果。

理由：这符合 Agent grounding 合同：查询执行成功不等于用户需求被满足。当前问题正是 0 结果被标成 satisfied 后直接支撑了错误 final answer。

备选方案：让空结果继续 `satisfied=true`，只改 prompt 让模型“谨慎表达”。该方案不能阻止 grounded result 被错误消费，放弃。

### Decision 4: 模型可见说明放在 tool manifest / schema / examples

更新 `description`、`whenToUse`、schema 描述和 examples：

- 明确“上肢、腿部/下肢、核心、全身”等高层区域使用 `bodyRegions`。
- 明确 `muscle` 只能使用动作库真实主肌群或辅助肌群 facet。
- 增加 `bodyRegions: ["lower_body"]` 查询腿部训练动作的例子。
- 不把 `searchExerciseResources` 的业务规则写入通用 Agent prompt。

理由：单个业务 tool 的模型可见说明应该随 tool manifest 暴露，避免污染通用 AgentAction 合同。

### Decision 5: 投影只增加必要诊断摘要

`toModelObservation`、`toUserProjection` 和 trace summary 可以暴露：

- `bodyRegions`
- `expandedMuscles`
- `appliedFilters`
- `totalMatches`
- `returnedCount`
- `truncated`

仍不得暴露完整数据库对象、完整 handler output、内部 service 对象或下游训练候选 evidence。

## Risks / Trade-offs

- [Risk] 新增 `bodyRegions` 后模型仍传 `muscle: "腿部"`。→ Mitigation: schema 描述、examples 和 manifest test 明确高层区域字段；若仍传错，空结果会是 `satisfied=false`，不再支撑成功推荐。
- [Risk] `bodyRegions` 展开列表遗漏动作库真实 facet。→ Mitigation: 使用与旧 `searchExercises` 稳定合同一致的下肢/上肢/核心映射，并通过真实动作库输入测试 `lower_body` 返回动作。
- [Risk] 空结果改成 `satisfied=false` 影响普通“没有符合条件动作”的回答。→ Mitigation: final answer 仍可基于 unsatisfied result 做失败解释，但不能表达为成功推荐；测试覆盖 projection 和 runtime grounding。
- [Risk] manifest/schema summary 没把数组枚举暴露给模型。→ Mitigation: 更新 `tool-registry-manifest` 测试，断言 `bodyRegions` 和枚举值出现在模型可见定义中。

## Validation Plan

- `openspec validate fix-search-exercise-resources-body-regions --strict`
- `npm test -- tests/agent-tools/search-exercise-resources.test.ts`
- `npm test -- tests/agent-core/tool-registry-manifest.test.ts`
- `npm run typecheck`
