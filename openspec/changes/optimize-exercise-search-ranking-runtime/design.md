## Context

当前 `/api/chat` 已经切到 Tool-first Agent。LLM 通过 `searchExercises` 传入结构化工具参数，服务端工具再执行动作检索、候选过滤和排序。现有动作检索链路是 `searchExercises -> listExerciseRecords -> prisma.exercise.findMany -> searchExercisesInMemory`，每次工具调用都会读取完整动作行，并在 Node 进程内执行 hard filters、`local-hash-v1` text/vector scoring 和固定业务加权。

当前动作库约 873 条，单次评分计算不重，但 2c2g 服务器上线后，Agent loop 的多次工具调用和并发用户会放大全量读取、Prisma 反序列化、完整动作详情对象构造和重复评分成本。另一方面，现有评分算法把 `isPublished`、`beginner`、`training` 作为固定业务加分，缺少按 `candidateUse`、section、难度目标和器械约束变化的 ranking profile，容易让默认友好动作压过更符合本轮意图的候选。

## Goals / Non-Goals

**Goals:**

- 优化 `searchExercises` 的排序策略，让评分按 `candidateUse`、结构化边界和训练用途分层，而不是使用单一固定业务加分。
- 明确 `query` 的参与模式：裸查询或模糊查询可作为召回门，已有可执行结构化边界时只作为排序增强，不能硬清零合法候选。
- 引入动作检索轻量投影缓存，减少每次工具调用的数据库全量读取、完整字段反序列化和重复对象构建。
- 保留完整动作详情的按需读取能力，确保卡片展示、Validator、Patch 和持久化仍基于数据库真实动作。
- 在 Agent run 内复用等价 `searchExercises` 结果，减少模型 retry 或多步决策中的重复检索。
- 增强 diagnostics / trace，能回答一次检索为什么命中、为什么排序、是否命中缓存、耗时多少。
- 用固定 ranking cases 验证算法变化，避免凭感觉调权重。

**Non-Goals:**

- 不引入 pgvector、外部 Vector DB 或真实 embedding 服务。
- 不替换 `local-hash-v1` 的向量表示。
- 不改变 Prisma Schema、动作 seed 数据格式或 `/api/chat` 外部 API 契约。
- 不新增服务端自然语言意图判断；服务端不得根据关键词改写 LLM 已输出的 intent、action 或高层语义字段。
- 不把检索缓存作为权限、Validator 或候选集合校验的替代品。

## Decisions

### Decision 1: 评分算法改为 ranking profile，而不是继续调固定常量

`searchExercisesInMemory` 继续先执行结构化 hard filters，再进入评分。评分层新增明确的 ranking profile，至少区分 `answer_only`、`recommendation`、`routine`、`plan` 和 `patch`。每个 profile 定义 text/vector/business 的权重、section 偏好、难度偏好和候选用途偏好。

原因：当前固定 `beginner + training` 加分对所有用途生效，不能表达“热身候选”“拉伸候选”“Patch 替代候选”“进阶动作解释”等差异。ranking profile 可以让业务排序依赖工具参数和候选用途，而不是依赖一个全局默认偏置。

取舍：不直接引入机器学习 reranker。当前数据量和评测集还不足以支撑学习排序；用可解释 profile 更容易调试和测试。

### Decision 2: `query` 模式显式化

检索内部将 `query` 归类为三种模式：

- `recall_gate`：裸 query 或缺少可执行结构化边界时，text/vector 分数可以决定是否进入候选集合。
- `ranking_boost`：`recommendation`、`routine`、`plan`、`patch` 已有结构化边界时，query 只能影响排序，不能把 hard filter 后的合法候选硬清零。
- `disabled`：没有 query 或调用方明确不希望自然语言影响排序时，不计算 query text/vector 分数。

原因：这保留了 RAG 对模糊需求的价值，同时避免“用户原话相似度”覆盖器械、section、候选用途等硬边界。

取舍：`ranking_boost` 可能让模糊表达对排序影响弱于裸搜，但这符合可执行训练内容的安全边界。

### Decision 3: 建立动作检索轻量投影缓存

新增动作检索索引读取层，返回 `ExerciseSearchRecord` 或等价轻量结构。缓存内容只包含检索、过滤和摘要需要的字段，例如 id、名称、肌群、器械、level、allowedSections、difficulty、movementPattern、goalTags、riskTags、embeddingText、embedding 和必要展示摘要。完整 `instructions`、图片、来源 URL 等详情字段继续由 `getExerciseById` 或批量详情读取按需获取。

缓存为进程内缓存，支持 TTL 和显式刷新函数。数据库未配置、查询失败或缓存构建失败时必须暴露错误，不使用陈旧缓存伪装成功，除非后续实现明确加入带版本的 stale fallback。

原因：当前 2c2g 风险主要来自重复全量读取和反序列化，不是 48 维向量计算。进程内缓存和字段裁剪是最小架构代价下的最大收益。

取舍：多实例部署时各实例有独立缓存；当前阶段可接受。后续如需要集中失效，再增加版本号或后台刷新。

### Decision 4: Agent run 内复用等价工具结果

Agent runtime 已有 tool idempotency key 概念，但当前 loop 仍会执行工具。实现阶段应在 runtime 或 `searchExercises` 工具层复用同一 run 内相同规范化输入的成功结果，并在 trace 中标记 `run_cache_hit`。

原因：LLM 可能因 retryable diagnostics、修复或多步决策重复查询相同候选。run-level reuse 可以减少重复评分和重复 DB/cache 读取，不改变工具语义。

取舍：只复用同一 run 内同一用户、同一 session、同一规范化输入的成功结果；失败结果是否复用需谨慎，避免挡住模型修复后的重查。

### Decision 5: 先建设 ranking 评测，再允许权重继续演进

实现必须新增固定 ranking cases，覆盖模糊表达、结构化字段、不同 `candidateUse`、器械避免、section、难度和 Patch 替代。测试既要断言 hard filters 不被向量绕过，也要断言 Top N 顺序或候选组满足预期。

原因：排序权重没有评测集时很容易出现局部修好、整体变差。先建立评测可以让后续替换真实 embedding 或 pgvector 时有回归基线。

取舍：评测集第一版不追求覆盖所有健身语义，只覆盖当前黑盒和产品路径中最高频、最容易回归的表达。

## Risks / Trade-offs

- [Risk] ranking profile 权重过拟合当前测试集。→ Mitigation: 测试同时覆盖正例、负例和 hard filter，不只断言某个动作必须第一。
- [Risk] 缓存导致动作库更新后短时间不可见。→ Mitigation: 使用短 TTL 和显式刷新函数；seed / refresh embeddings 后可触发刷新。
- [Risk] 轻量投影缺少 Validator 需要的字段。→ Mitigation: 明确 SearchRecord 与 DetailRecord 边界；Validator 或保存路径需要完整字段时继续按 id 读取详情。
- [Risk] 同 run 复用错误结果影响模型修复。→ Mitigation: 第一版只复用成功的等价检索结果；retryable failure 仍允许模型带新参数重试。
- [Risk] trace 记录过大。→ Mitigation: 只记录 top rerank 摘要、计数、耗时、score breakdown 和最终 id，继续遵守字段长度限制。

## Migration Plan

1. 新增检索投影类型、缓存读取层和刷新函数，但保持旧 `searchExercises` 对外签名稳定。
2. 将 `searchExercises` 的数据来源从完整动作全量读取切到轻量索引缓存。
3. 引入 ranking profile 和 query mode，更新 diagnostics / trace。
4. 增加 Agent run 内等价检索复用。
5. 补充单元测试、Agent 工具测试和 OpenSpec 验证。

如上线后出现异常排序，可回退到旧 scoring profile 或关闭 run-level reuse；缓存层可通过 TTL 缩短或显式刷新降级，外部 API 不需要迁移。

## Open Questions

- 第一版缓存 TTL 使用固定值还是配置项，需要实现时结合现有配置方式确定。
- `searchExercises` 返回给模型的候选摘要是否同步瘦身，还是只先优化内部索引读取，需要结合现有卡片投影确认。
