## Why

结构化过滤能解决权限、类型和硬约束问题，但用户常用“拜拜肉”“核心不稳”“圆肩”“之前那个练胸的”等模糊表达。系统需要混合检索提升召回能力，同时保证 RAG 只作为检索层，不能绕过动作合法性、用户权限、Policy 或 Validator。

## What Changes

- 为 artifact 和 exercise 建立 embedding 文本与向量索引，可使用 pgvector 作为第一阶段实现。
- `searchArtifacts` 和 `searchExercises` 支持结构化过滤 + 全文检索 + 向量检索 + 业务 rerank 的混合检索。
- 结构化硬过滤优先执行，包括 userId、visibility、kind、scope、allowedSections、equipment、level、risk 和 status。
- Rerank 综合目标匹配、肌群、运动模式、新鲜度、疲劳、递进适配和用户反馈。
- 检索结果必须记录 trace，便于分析召回、过滤和排序问题。

## Capabilities

### New Capabilities
- `rag-hybrid-search`: 定义 artifact 和 exercise 的 embedding、混合检索、结构化硬过滤和业务 rerank 要求。

### Modified Capabilities
- `reference-resolver`: 语义引用可使用 hybrid search 召回候选，但仍只能在候选集合内解析。
- `exercise-metadata-pools`: 动作召回可使用向量增强，但必须保留分池和 Validator 边界。

## Impact

- 影响 artifact index、动作检索、ReferenceResolver、Exercise Retrieval Service、AI trace 和数据迁移/索引。
- 需要新增 embedding 生成与更新流程、pgvector 或等价向量字段、混合检索测试和权限边界测试。
