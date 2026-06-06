## Why

当前动作查询的结构化 facet 合同已经足够严格，但它不适合承载热身、拉伸、目标部位、动作语义相近性这类召回问题。严格组合 `section`、器械、难度、肌群等字段时，数据库中可能存在适合作为 support section 的动作，但因为某个 facet 组合不完全一致而查空。反过来，如果让 Planner 反复放宽筛选条件，又会把查询策略退回模型临场决策，破坏服务端只负责确定性合同和事实边界的原则。

本 change 采用两阶段方案：

1. 第一阶段只建设数据基础设施：补齐动作语义索引所需的 `embeddingText`、pgvector 存储和本地 `Local Hash V1` 向量生成优化，不接入 `searchExerciseResources` 或其他业务查询路径。
2. 第二阶段在基础设施稳定后，再把语义召回作为 `searchExerciseResources` 的 `q` recall / ranking signal 引入，同时继续保留结构化字段作为 hard filters。

这样可以先把可测试、可回填、可追踪的数据层打稳，再让业务 tool 获得更好的热身、拉伸和目标部位语义检索能力。第一阶段不会改变模型可见 tool 合同，也不会让服务端根据用户原文做关键词分流。

## What Changes

- 分阶段建设 Exercise 语义检索能力，明确第一阶段是 infrastructure-only，第二阶段才改变业务查询行为。
- 第一阶段为 Exercise 维护稳定的 `embeddingText` 和 pgvector 向量索引，向量生成只使用本地 deterministic `Local Hash V1`，不引入外部 embedding model。
- 第一阶段优化 `Local Hash V1` 的本地检索质量，包括字段权重、中文 / 英文混合短语、动作名称、别名、肌群、器械、`allowedSections`、`movementPattern`、`intensityRole` 和目标标签的索引文本组织。
- 第一阶段增加回填、刷新、版本和诊断要求，确保向量生成可重复、可审计、可测试。
- 第一阶段明确不得修改 `searchExerciseResources` handler、repository、manifest、schema description、examples、model observation 或 `/api/chat` 编排。
- 第二阶段把 `searchExerciseResources.q` 从确定性文本 where 条件调整为语义召回 / 排序信号；结构化字段继续作为数据库 hard filters。
- 第二阶段不增加一组让模型难以选择的新参数；热身 / 拉伸 / 部位语义应通过现有 section / facet hard filters 加 `q` 的语义排序能力表达。
- 第二阶段继续禁止服务端基于用户原文关键词、正则、同义词表、短句模板或具体 phrasing 改写 tool input、action、`toolName` 或调用顺序。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `rag-hybrid-search`: 分阶段补齐 Exercise 语义索引基础设施，要求 `embeddingText`、本地 deterministic embedding、pgvector 存储 / 索引、回填脚本、版本诊断和 RAG trace 具备可验证边界。
- `agent-exercise-resource-query-tool`: 第二阶段调整 `searchExerciseResources` 的 `q` 语义，使其成为 hard filters 之后的语义召回 / 排序信号，而不是额外 hard filter；同时保持该 tool 只读动作事实查询职责。

## Impact

- 第一阶段预计影响：
  - `prisma/schema.prisma` 和数据库 migration 中 Exercise 向量基础设施。
  - `lib/shared/search/hybrid-search.ts` 或等价本地 hash embedding helper。
  - Exercise `embeddingText` 构建、回填和刷新脚本。
  - 集中配置中的向量维度、版本、刷新批量大小或索引策略。
  - 数据层、脚本和本地 embedding 的自动化测试。
- 第一阶段不影响：
  - `searchExerciseResources` 的 input / output schema、manifest、examples、handler、repository、projection、trace、model observation。
  - `/api/chat`、Agent runtime 主循环、PlannerPort、Executor、Policy Guard、ResourceStore、Response Renderer 或 visible output validator。
- 第二阶段预计影响：
  - `searchExerciseResources` repository 查询路径、`q` 语义、模型可见说明、projection / trace summary 和 tool-level tests。
  - `agent-exercise-resource-query-tool` 和 `rag-hybrid-search` 相关 OpenSpec requirements。
- 第二阶段不影响：
  - 训练方案生成、保存、训练卡片渲染、用户记忆或 candidate set 资源职责。
  - 服务端自然语言 intent 判断、关键词路由或 prompt 特例分支。
