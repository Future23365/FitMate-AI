## Context

当前项目已经有两条相关但边界不同的能力：

- `rag-hybrid-search` 规定 hybrid search 必须先保留结构化 hard filters，再使用全文、向量或业务 rerank。
- `searchExerciseResources` 是 production Agent 的只读动作库事实查询 tool，当前依赖专用 repository 下推结构化字段，不允许回到旧 `searchExercises()` 或全量动作读取路径。

本次问题不在于模型不知道要继续查热身或拉伸，而是工具缺少适合 support section 的语义召回能力。只增加更多结构化参数会提高 Planner 选择难度；让 Planner 在查空后自由放宽 hard filters，又会把稳定查询边界退回模型临场策略。因此本 change 把工作拆成两个阶段：

1. 先做数据基础设施，确保每个可检索动作都有稳定 `embeddingText` 和本地生成的向量，并能进入 PostgreSQL + pgvector。
2. 再改业务查询，把 `q` 变成 hard filters 之后的语义 recall / ranking signal。

治理边界：

- Resource：发布态 `Exercise` 动作库事实。
- 能力族：第一阶段是 index / refresh / validate；第二阶段才是 query。
- 第一阶段不得修改业务 tool 查询行为，也不得新增模型可见 tool 参数。
- 第二阶段不得让服务端根据用户原文做 intent 分类、关键词分流、短句模板路由或具体 `toolName` 分支。

## Goals / Non-Goals

**Goals:**

- 为 Exercise 建立可回填、可刷新、可版本化的 `embeddingText` 与 pgvector 向量基础设施。
- 第一阶段只使用本地 deterministic `Local Hash V1` 生成向量，不调用外部 embedding model。
- 优化 `Local Hash V1` 对健身动作字段的表达质量，让热身、拉伸、部位、器械、肌群、动作类型和目标标签能进入统一语义索引。
- 第一阶段提供数据层验证，证明向量生成稳定、维度一致、空文本可诊断、回填可重复。
- 第二阶段让 `searchExerciseResources.q` 作为语义召回 / 排序信号，提高类似胸部热身、胸部拉伸、support section 动作查询的召回质量。
- 第二阶段继续保留 `equipment`、`suitabilities` / section、`muscles`、`level`、`homeRequirement`、`riskTag` 等结构化字段为 hard filters。

**Non-Goals:**

- 第一阶段不改变 `searchExerciseResources` 或 `/api/chat` 的用户可观察行为。
- 第一阶段不修改 tool manifest、schema description、examples、model observation、projection 或 trace summary。
- 第一阶段不引入 OpenAI、DeepSeek 或其他外部 embedding model。
- 第二阶段不新增一组细碎参数，例如专门的 `warmupTarget`、`stretchTarget`、`supportSectionTarget` 或自然语言意图 enum。
- 第二阶段不把 `q` 当作 hard filter，不从 `q` 或用户原文中解析隐藏的器械、肌群、section、难度或目标约束。
- 不引入独立 Vector DB；使用 PostgreSQL + pgvector 作为事实数据库内的向量索引能力。

## Decisions

### 1. 第一阶段只做 infrastructure-only

第一阶段允许触碰数据库 schema / migration、本地 embedding helper、回填脚本、集中配置和数据层测试。它不得触碰 `searchExerciseResources` 的执行合同。这样可以先验证向量数据是否稳定，避免把基础设施和业务查询行为混在一次变更里。

阶段一完成时应能回答：

- 哪些 Exercise 已有 `embeddingText`。
- 向量维度、版本和生成器是否一致。
- pgvector 列和索引是否存在。
- 回填脚本是否可以重复执行且不会改坏非索引字段。
- 业务查询结果是否与变更前一致。

### 2. 本地 `Local Hash V1` 是第一阶段唯一向量生成器

第一阶段不接外部 model。`Local Hash V1` 的价值是离线、便宜、可测和 deterministic。优化方向是动作库字段组织和本地 token 处理，而不是让服务端理解用户意图：

- `embeddingText` 应包含动作中文 / 英文名称、别名、分类、器械、居家条件、主 / 辅肌群、`allowedSections`、`movementPattern`、`intensityRole`、`goalTags` 和安全的适用场景字段。
- 字段权重可以反映动作名称、肌群、section 和器械的重要性。
- 本地 term expansion 只能用于生成向量和排序，不得成为 hard filter，也不得被 `/api/chat` 或 tool routing 读取为 intent 判断。

如果实现只优化字段权重、文本构建和归一化，仍可保持 `local-hash-v1`。如果改变向量维度、hash 槽位语义或不可兼容算法，必须显式升级 embedding version，并要求全量回填。

### 3. pgvector 是事实库内索引能力，不是独立向量数据库

本 change 不引入独立 Vector DB。Exercise 的结构化事实仍来自 PostgreSQL，pgvector 只作为同库向量索引能力存在。第一阶段应让 migration、schema、索引和刷新脚本具备以下边界：

- 向量列维度固定且与本地生成器一致。
- 可记录或推导 embedding version，避免不同算法生成的向量混用。
- `embeddingText` 与向量回填只更新索引相关字段，不改动作业务字段。
- 索引失败、维度不一致或文本为空应有可诊断输出。

### 4. 第二阶段只改变 `q` 的召回 / 排序语义

第二阶段不增加大量新参数。Planner 仍使用现有结构化字段表达 hard filters，例如 `equipment = "no_equipment"`、`suitabilities = ["warmup"]` 或 `["stretch"]`、`muscles`、`level` 等。`q` 用于表达“胸部热身”“胸部拉伸”“肩前侧放松”这类语义排序目标。

查询顺序应是：

1. 校验 schema 和合法 facet。
2. 在数据库层执行发布态、器械、section、肌群、难度、风险等 hard filters。
3. 在 hard-filtered candidate scope 内使用 pgvector / text score / business score 召回和排序。
4. 返回动作事实、section 分组、命中数量、排序诊断和 trace 摘要。

`q` 不得反向添加或放宽 hard filters。例如 `q = "胸部热身"` 不能让服务端自动添加 `muscles = ["胸部"]`，也不能在 `equipment = "no_equipment"` 查空时自动删除器械约束。是否换用其他结构化字段、澄清或失败收口仍由 Planner 基于 tool result 自主决定。

### 5. 第二阶段仍不产出 candidate set 或训练方案

`searchExerciseResources` 即使获得语义检索能力，也仍是只读动作库事实查询 tool。它返回的是动作事实原料，不生成 routine、plan、patch、训练卡片、保存事件或 candidate set resource。最终 `visibleTrainingProposal` 仍由 Planner 输出，并由 terminal validator 校验 `exerciseId`、section、处方和 schedule。

### 6. 测试先证明阶段边界，再证明召回质量

阶段一测试重点：

- `embeddingText` 构建覆盖关键动作字段。
- `Local Hash V1` 输出稳定、维度正确、归一化正确。
- 回填脚本不会触碰业务字段。
- pgvector migration / schema 可用。
- `searchExerciseResources` 行为未变化。

阶段二测试重点：

- hard filters 不被 `q` 绕过。
- `q` 能在 hard filters 后改善 warmup / stretch / body-area 语义排序。
- repository 不回到全量读取或旧 `searchExercises()`。
- projection 和 trace 表达 vector version、召回数量、过滤数量、排序摘要和最终 exerciseId。

## Risks / Trade-offs

- Risk: 第一阶段顺手改业务查询，导致基础设施和行为变化无法隔离。Mitigation：tasks 和 spec 明确第一阶段不得修改 `searchExerciseResources` 合同，并要求行为不变测试。
- Risk: 本地 hash embedding 语义能力有限。Mitigation：第一阶段只要求 deterministic baseline，并通过字段权重和 `embeddingText` 改善动作库内排序；外部 model 不进入本 change。
- Risk: pgvector 与 Prisma 类型支持需要 raw SQL 或 Unsupported 类型。Mitigation：design 要求 migration、schema 和 repository 边界显式记录，避免把向量继续只藏在 JSON 字段里。
- Risk: 第二阶段把 `q` 误用成 hard filter。Mitigation：spec 明确 `q` 只能用于 recall / ranking，所有 hard filters 必须来自结构化字段。
- Risk: 为热身 / 拉伸新增过多参数。Mitigation：第二阶段使用现有 section / facet hard filters 加 `q`，不新增专门意图参数。

## Migration Plan

1. 创建并验证本 change 的 OpenSpec 文档。
2. 第一阶段实现数据库 extension、vector 列 / 索引、集中配置、本地 embedding helper 优化、`embeddingText` 构建和回填脚本。
3. 第一阶段运行数据层和脚本测试，并验证 `searchExerciseResources` 行为未变化。
4. 第一阶段完成后，再进入第二阶段实现。
5. 第二阶段更新 `searchExerciseResources` 的 `q` 合同、repository 查询路径、projection、trace 和 tests。
6. 第二阶段验证 hard filters、warmup / stretch 语义排序、无全量读取、无服务端语义分流。

回滚策略：第一阶段可通过不启用向量查询恢复现有业务行为；第二阶段如召回质量不稳定，应回退 `q` 语义接入，不删除已回填的索引字段。

## Open Questions

- 第一阶段实现时需要确认 pgvector 维度是否继续使用当前 `searchEmbeddingDimensions = 48`，或在显式版本升级后调整。若调整维度，必须作为不可兼容 embedding version 处理并全量回填。
