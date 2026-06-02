## Why

当前 `searchExercises` 每次从 PostgreSQL 全量读取动作，再在 Node 进程内完成结构化过滤、`local-hash-v1` 混合评分和排序。以当前 873 条动作看，单次计算不重，但在 2c2g 服务器和 Agent loop 多次工具调用下，重复全量查询、Prisma 反序列化和固定权重排序会带来延迟抖动、内存压力和排序质量不稳定。

这次 change 需要一次性收紧动作检索的运行时成本和排序合同：保留 Tool-first Agent、结构化硬过滤和服务端校验边界，同时直接优化现有评分策略、缓存策略和可观测性。

## What Changes

- 优化 `searchExercises` 内部评分算法，将固定 `businessScore` 改为按 `candidateUse`、`allowedSections`、难度目标、目标肌群、器械约束和训练用途分层加权。
- 将 `query` 参与方式拆成明确的召回门、排序增强和禁用三种模式，避免自然语言 query 覆盖可执行候选硬边界，同时保留对模糊需求的排序价值。
- 引入动作检索轻量投影与进程内缓存，避免每次工具调用都全量读取完整动作详情。
- 保留完整动作详情按需读取路径，确保卡片展示、Validator、保存和详情工具继续使用数据库真实动作。
- 在 Agent run 内复用等价 `searchExercises` 结果，减少模型重试或多步决策中的重复检索。
- 扩展检索 trace / diagnostics，记录缓存命中、耗时、候选数量、评分组成、query 模式和最终排序原因。
- 增加固定 ranking 评测用例，覆盖模糊召回、结构化硬过滤、不同 `candidateUse`、器械正负约束、难度和 section 排序。
- 不引入独立 Vector DB、pgvector 或外部 embedding 服务；`local-hash-v1` 仍作为本阶段离线可测的混合检索向量表示。
- 不新增服务端自然语言语义判断，不用关键词或同义词去改写 LLM 已输出的高层 intent；检索词典只能作为候选召回和排序辅助。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `rag-hybrid-search`: 收紧动作混合检索的排序、运行时缓存、query 参与模式、Agent 工具 trace 和 ranking 评测要求。

## Impact

- 主要影响 `lib/server/exercises/*`、`lib/shared/search/hybrid-search.ts`、`lib/server/agent-orchestrator/*` 中 `searchExercises` 工具执行和 trace 摘要。
- 可能影响 `lib/server/workout-plans/exercise-candidate-service.ts`、`lib/server/workout-patches/*`、`lib/server/exercise-recommendations/*` 等复用动作候选的调用方。
- 新增或调整动作检索单元测试、Agent 工具测试和黑盒/详细 LLM 流程中的检索诊断断言。
- 不改变 `/api/chat` 外部 API 契约，不改变 Prisma Schema，不改变动作库数据格式，不改变用户可见训练计划结构。
