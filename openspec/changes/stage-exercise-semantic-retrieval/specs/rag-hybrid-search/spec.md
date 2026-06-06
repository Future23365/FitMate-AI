## ADDED Requirements

### Requirement: Exercise 语义检索能力必须按阶段启用
系统 SHALL 将 Exercise 语义检索拆分为基础设施阶段和业务查询接入阶段，避免在索引数据尚未稳定前改变 `searchExerciseResources` 或其他 production Agent tool 行为。

#### Scenario: 第一阶段只建设数据基础设施
- **WHEN** 第一阶段实现完成
- **THEN** 系统 MUST 支持为 Exercise 生成或刷新 `embeddingText`
- **AND** 系统 MUST 支持使用本地 deterministic embedding generator 生成固定维度向量
- **AND** 系统 MUST 支持将 Exercise 向量写入 PostgreSQL pgvector 存储或等价同库向量列
- **AND** 系统 MUST 提供回填、刷新、版本和诊断能力
- **AND** 系统 MUST NOT 改变 `searchExerciseResources`、`searchExercises`、`/api/chat` 或其他业务查询路径的用户可观察行为

#### Scenario: 第二阶段才接入业务查询
- **WHEN** 第二阶段实现开始
- **THEN** 系统 MUST 已经具备可验证的 Exercise `embeddingText`、向量列、版本和回填能力
- **AND** 第二阶段 MAY 将向量检索接入 `searchExerciseResources.q`
- **AND** 第二阶段 MUST 保留结构化字段作为 hard filters
- **AND** 第二阶段 MUST NOT 要求 Planner 选择一组新增的热身、拉伸或部位意图参数

### Requirement: Exercise embedding 必须使用本地 Local Hash V1 baseline
系统 SHALL 在第一阶段仅使用本地 deterministic `Local Hash V1` 或其显式版本化后继生成 Exercise 向量，不得调用外部 embedding model。

#### Scenario: 本地生成 Exercise 向量
- **WHEN** 系统为 Exercise 生成 embedding
- **THEN** 生成器 MUST 在本地运行
- **AND** 生成器 MUST 不依赖 OpenAI、DeepSeek 或其他外部 model API
- **AND** 同一 `embeddingText`、版本和维度 MUST 生成相同向量
- **AND** 向量维度 MUST 与 pgvector 列维度一致
- **AND** 生成结果 MUST 可通过自动化测试验证稳定性

#### Scenario: 优化 Local Hash V1
- **WHEN** 第一阶段优化 `Local Hash V1`
- **THEN** 优化 SHOULD 覆盖动作名称、别名、分类、器械、居家条件、主肌群、辅助肌群、`allowedSections`、`movementPattern`、`intensityRole` 和 `goalTags` 的索引表达
- **AND** 优化 MAY 调整字段权重、分词、归一化和本地 term expansion
- **AND** 本地 term expansion MUST 只能用于 embedding 和排序
- **AND** 本地 term expansion MUST NOT 成为结构化 hard filter
- **AND** 服务端 MUST NOT 基于本地 term expansion 改写 Agent action、`toolName`、tool input 或调用顺序

#### Scenario: 不兼容变更必须版本化
- **WHEN** 向量维度、hash 槽位语义或不可兼容算法发生变化
- **THEN** 系统 MUST 引入新的 embedding version 或等价版本标识
- **AND** 系统 MUST 要求 Exercise 向量全量回填
- **AND** 系统 MUST NOT 将不同版本向量静默混用为同一检索索引

### Requirement: Exercise embeddingText 必须覆盖安全动作事实
系统 SHALL 为 Exercise 构建安全、稳定、可重复的 `embeddingText`，用于本地向量生成和后续语义排序。

#### Scenario: 构建 Exercise embeddingText
- **WHEN** 系统为发布态或可索引 Exercise 构建 `embeddingText`
- **THEN** `embeddingText` SHOULD 包含动作中文名、英文名、别名、分类、器械、居家条件、主肌群、辅助肌群、`allowedSections`、`movementPattern`、`intensityRole`、`goalTags` 和安全适用场景摘要
- **AND** `embeddingText` MUST NOT 包含用户私密数据、跨用户 payload、secret 或未经脱敏的大 payload
- **AND** `embeddingText` MUST 可由当前 Exercise 数据确定性重建
- **AND** 空文本或缺少关键字段 MUST 进入诊断，而不是静默写入无意义向量

### Requirement: Exercise pgvector 基础设施必须可回填和可诊断
系统 SHALL 在 PostgreSQL 内提供 Exercise 向量存储、索引和刷新能力，避免业务查询接入时依赖全量内存扫描。

#### Scenario: 建立同库向量基础设施
- **WHEN** 第一阶段数据库 migration 执行
- **THEN** 系统 MUST 启用或校验 pgvector extension
- **AND** 系统 MUST 为 Exercise 提供固定维度向量列或等价 pgvector 存储结构
- **AND** 系统 SHOULD 为后续相似度查询建立合适索引
- **AND** 系统 MUST 保留或提供 `embeddingText` 字段用于诊断和回填
- **AND** 系统 MUST 避免仅把向量藏在 JSON 字段中作为未来查询主路径

#### Scenario: 回填 Exercise 向量
- **WHEN** 运维或测试执行 Exercise embedding 回填
- **THEN** 回填 MUST 只更新索引相关字段
- **AND** 回填 MUST NOT 修改动作名称、肌群、器械、section、发布态或其他业务字段
- **AND** 回填 MUST 输出处理数量、跳过数量、失败数量、embedding version 和维度摘要
- **AND** 回填 MUST 支持重复执行

### Requirement: Exercise 语义查询必须在 hard filters 后排序
系统 SHALL 在第二阶段将 Exercise 向量检索作为 hard filters 之后的 recall / ranking 能力，而不是替代结构化过滤。

#### Scenario: 使用向量语义排序动作
- **WHEN** 第二阶段业务查询接入后执行 Exercise semantic retrieval
- **THEN** 系统 MUST 先应用发布态、器械、section、肌群、难度、风险、点名动作和排除动作等结构化 hard filters
- **AND** text score、vector score、business score 或 RAG score MUST NOT 让不满足 hard filters 的动作进入最终结果
- **AND** `query` 或 `q` MUST 只能作为召回 / 排序信号
- **AND** 系统 MUST NOT 从 `query`、`q` 或用户原文中解析隐藏 hard filters

#### Scenario: 记录 Exercise semantic retrieval trace
- **WHEN** 第二阶段执行 Exercise semantic retrieval
- **THEN** trace SHOULD 记录 query、hard filters、embedding version、向量维度、hard-filtered candidate count、returned count、rerank 摘要和最终 exerciseId
- **AND** trace MUST 遵守现有权限、脱敏和字段长度限制
