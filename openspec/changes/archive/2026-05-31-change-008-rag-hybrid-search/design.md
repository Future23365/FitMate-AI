## Context

第一批 change 建立了 artifact、引用解析、Patch 和 trace，但语义引用和动作检索仍主要依赖结构化字段和文本匹配。为了处理模糊自然语言，需要引入向量召回；但向量召回只能提升候选覆盖率，不能成为规则引擎。

## Goals / Non-Goals

**Goals:**

- 为 artifact 和 exercise 生成 embeddingText 与 embedding。
- 在 `searchArtifacts` 和 `searchExercises` 中加入混合检索。
- 保持 userId、visibility、kind、scope、section、器械、难度、风险和 status 的硬过滤。
- 增加业务 rerank 和检索 trace。

**Non-Goals:**

- 不引入独立 Vector DB；第一阶段优先使用 PostgreSQL / pgvector 或等价轻量方案。
- 不允许 RAG 替代 Policy、Validator、PatchEngine 或 PlanEngine。
- 不实现复杂 Agent runtime。

## Decisions

### Decision 1: pgvector 优先

项目事实数据在 PostgreSQL 中，第一版向量检索优先使用 pgvector，避免额外维护独立向量库和跨库一致性。规模上来后再考虑独立 Vector DB。

实现落地时允许先使用 PostgreSQL `Json` 字段保存固定维度本地 hashing embedding，查询端在结构化硬过滤后的候选集合内执行 cosine rerank。该方案不引入外部模型调用成本，适合当前本地开发和测试；后续迁移到 pgvector 时，回滚边界是删除 `embeddingText` / `embedding` 字段、回退迁移，并恢复全文检索排序。

### Decision 2: embeddingText 由服务端生成

artifact 和 exercise 的 embeddingText 由服务端从标题、摘要、目标、肌群、器械、动作别名和结构化字段生成，避免直接把大 payload 或未经脱敏内容送入 embedding。

### Decision 3: 硬过滤先于向量召回

用户权限、artifact status、动作可见性、器械、section 和风险等硬约束必须先过滤或在召回后再次过滤。向量结果不得绕过这些边界。

### Decision 4: Rerank 业务化

最终排序不只看向量相似度，还要结合目标、肌群、movementPattern、新鲜度、用户反馈、疲劳和递进适配。排序原因写入 trace 摘要。

## Risks / Trade-offs

- [Risk] embedding 成本和延迟增加。→ Mitigation: artifact/exercise 写入或更新时异步生成，查询端使用已有 embedding。
- [Risk] 向量召回命中不合规动作。→ Mitigation: 结构化硬过滤和 Validator 双重拦截。
- [Risk] embeddingText 泄露敏感信息。→ Mitigation: 不嵌入无关私密 payload，按 userId 和可见性隔离查询。
