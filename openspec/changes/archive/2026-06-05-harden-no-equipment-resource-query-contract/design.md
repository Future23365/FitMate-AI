## Context

`searchExerciseResources` 当前把 `equipment` 和 `homeRequirement` 都作为 Planner 可见的数据库 facet。真实数据中，标准俯卧撑是 `equipment = "body only"` / `equipmentZh = "自重"`，但 `homeRequirement = "floor"` / `homeRequirementZh = "地面/瑜伽垫"`。当 Planner 看到 `homeRequirement = "none"` / `"无器械"` 时，很容易把用户的“无器械”约束填到居家条件字段，导致自重但需要地面的动作被排除。

本 change 属于 Agent tool 执行合同和模型可见合同变更。实现必须遵守 Agent 边界：Planner 负责理解用户自然语言并选择 tool input；服务端负责暴露清晰的结构化合同、校验 schema、执行确定性数据库映射和返回事实，不根据用户原文、关键词、正则、同义词表或短句模板替模型选择筛选条件。

## Goals / Non-Goals

**Goals:**

- 将“无器械”从 `homeRequirement` 模型可见 facet 中移除，避免 Planner 把器械约束误填成环境条件。
- 在 `equipment` 查询合同中提供 `no_equipment` / `无器械` 语义，并确定性映射到数据库中的自重动作事实。
- 保留 `homeRequirement` 作为环境、场地或支撑条件，不再表达器械可用性。
- 更新 `facetCatalog`、schema description、examples、model observation、trace / projection 和 tests，确保模型实际看到的是清晰合同。
- 明确不做旧 `homeRequirement = "none"` / `"无器械"` 兼容，不新增 alias、fallback 或 handler 自动迁移。

**Non-Goals:**

- 不修改底层数据库字段，不新增 Prisma migration。
- 不把数据库里已有 `homeRequirement = "none"` 改写或删除；它只是不再作为 Planner 可见居家条件 facet。
- 不新增服务端自然语言关键词、正则、同义词表、短句模板或用户原文路由。
- 不改 `/api/chat` 主链路、Agent runtime 主循环、`PlannerPort`、`Policy Guard`、`ResourceStore`、`Resource Contract Validator` 或 Response Renderer 主流程。
- 不新增长期兼容层；旧输入应通过 schema / repair / 回归测试暴露，而不是在 handler 里静默修正。

## Decisions

### 1. `homeRequirement` 只表达环境条件

`homeRequirement` 在 Planner 可见合同中应表示动作需要的环境、场地或支撑条件，例如地面、支撑物、户外、搭档、居家小器械或健身房器械。`none` / `无器械` 不属于这个概念，它描述的是器械可用性，因此不得继续出现在 `facetCatalog.homeRequirements`、schema description 或 examples 中。

取舍：保留 `none` 可以最小化改动，但会继续让模型把“无器械”误查为 `homeRequirement = none`。移除该值会要求模型使用更正确的 `equipment` 字段，长期边界更清晰。

### 2. `equipment` 承载 `no_equipment` 语义

`equipment` 的模型可见 catalog 应包含当前数据库真实器械值，并额外提供稳定查询语义 `no_equipment` / `无器械`。当 handler / repository 收到该语义时，只做确定性数据库映射：

- `equipment = "no_equipment"` 或 `"无器械"` 匹配 `equipment = "body only"` 或 `equipmentZh = "自重"`。
- 该映射不得默认附加 `homeRequirement = "none"`。
- 如果模型同时传入合法环境条件，例如 `homeRequirement = "floor"`，repository 才额外按该环境条件过滤。

取舍：直接让模型使用 `body only` 也能工作，但 `body only` 是源数据英文 facet，不符合用户语义；新增 `no_equipment` 作为 tool 合同值，可以让模型更稳定地表达用户约束，同时仍由服务端确定性映射到数据库事实。

### 3. 不做旧 `homeRequirement = none` 兼容

本 change 明确不在 handler 中把 `homeRequirement = "none"` / `"无器械"` 自动迁移到 `equipment = "no_equipment"`。旧兼容会把错误合同继续留在生产链路里，也会鼓励后续继续堆业务兼容分支。

实现时应删除模型可见旧用法，并通过 tests 断言 manifest / examples 不再出现该误导组合。若模型仍输出旧字段组合，应由严格 schema、repair 或失败诊断暴露问题，而不是静默兜底。

### 4. Repository 保持下推查询，不回退到内存过滤

`searchExerciseResources` 仍应使用专用 repository，在数据库层执行 `where/count/findMany(select)`。`no_equipment` 的映射应进入 where 构造，例如生成 `OR: [{ equipment: "body only" }, { equipmentZh: "自重" }]`，不得回退到全表读取后内存过滤，也不得调用旧 `searchExercises()`、hybrid search 或 pgvector rerank。

### 5. 模型可见 examples 只展示正确字段组合

examples 应展示 `equipment = "no_equipment"` / `"无器械"` 查询自重动作，不应再展示 `Pushups` 与 `homeRequirement = "none"` 的组合。若示例需要表达地面条件，应显式使用 `homeRequirement = "floor"` / `"地面/瑜伽垫"`，并解释它是环境条件，不是无器械条件。

## Risks / Trade-offs

- [Risk] 删除 Planner 可见 `homeRequirement = none` 后，旧模型输出可能短期失败。Mitigation：不做静默兼容，使用 schema / repair / 回归测试暴露并收敛模型可见合同。
- [Risk] `equipment` 中新增 `no_equipment` 不是数据库原始 facet。Mitigation：将它定义为 tool 合同层的稳定查询语义，并由 repository 确定性映射到数据库真实自重字段，不根据用户原文判断。
- [Risk] 现有动作仍保存 `homeRequirement = none`。Mitigation：数据库存储事实不变；仅调整 Planner 可见 catalog 和 query contract。
- [Risk] 实现可能误把 `floor`、`support` 全部默认纳入无器械查询。Mitigation：`no_equipment` 只过滤器械；环境条件只有在模型显式传入 `homeRequirement` 时才参与过滤。

## Migration Plan

1. 更新 `facetCatalog` 构造：`equipment` 增加 `no_equipment` / `无器械`；`homeRequirements` 从 Planner 可见输出中过滤 `none` / `无器械`。
2. 更新 `searchExerciseResources` input schema、schema description、manifest 和 examples，表达 `equipment` 与 `homeRequirement` 的职责分离。
3. 更新 repository where 构造，为 `equipment = "no_equipment"` / `"无器械"` 下推自重动作查询。
4. 更新 model observation、user projection 和 trace summary，确保 applied filters 表达真实查询语义。
5. 更新 tool-level、manifest、contract helper、production chat 和 architecture boundary 测试。

如需回滚，必须整体恢复 Planner 可见旧 facet 与旧查询合同；不得只恢复 handler 兼容而不恢复 manifest / schema / tests。

## Open Questions

无。
