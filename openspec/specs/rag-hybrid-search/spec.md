# rag-hybrid-search Specification

## Purpose
TBD - created by archiving change change-008-rag-hybrid-search. Update Purpose after archive.
## Requirements
### Requirement: Artifact 和 Exercise 必须支持 embedding 索引
系统 SHALL 为需要语义检索的 artifact 和 exercise 维护可控 embeddingText 和 embedding。

#### Scenario: 创建或更新 artifact index
- **WHEN** 系统创建或更新 ArtifactIndex
- **THEN** 系统 SHOULD 生成用于检索的 embeddingText
- **AND** embeddingText MUST 来自标题、摘要、目标、标签、肌群、器械和可安全索引字段
- **AND** embeddingText MUST NOT 包含未经脱敏的大 payload 或其他用户私密内容

#### Scenario: 创建或更新 exercise
- **WHEN** 动作库新增或更新动作
- **THEN** 系统 SHOULD 生成动作 embeddingText 和 embedding
- **AND** embeddingText SHOULD 包含动作名称、别名、肌群、器械、movementPattern、intensityRole 和适用场景

### Requirement: 混合检索必须保留结构化硬过滤
系统 SHALL 在全文和向量召回前后执行结构化硬过滤，确保 RAG 不绕过权限和训练规则。

#### Scenario: 搜索 artifact
- **WHEN** ReferenceResolver 使用 hybrid search 搜索 artifact
- **THEN** 搜索 MUST 限制为当前 userId 可访问的 artifact
- **AND** 搜索 MUST 遵守 kind、scope、status 和 sessionScope 过滤
- **AND** LLM MUST NOT 选择候选集合之外的 artifactId

#### Scenario: 搜索 exercise
- **WHEN** Exercise Retrieval Service 使用 hybrid search 搜索动作
- **THEN** 搜索 MUST 遵守 visibility、allowedSections、equipment、level、risk 和用户限制
- **AND** 搜索结果 MUST 继续进入分池和 Validator

### Requirement: Rerank 必须结合业务规则
系统 SHALL 在混合检索后使用业务特征对候选排序。

#### Scenario: 动作候选排序
- **WHEN** 系统获得全文和向量召回候选
- **THEN** rerank SHOULD 综合目标匹配、primaryMuscles、movementPattern、用户反馈、新鲜度、疲劳和 progression fit
- **AND** 排序结果 MUST 保留可追踪原因摘要

### Requirement: RAG 决策必须可追踪
系统 SHALL 记录语义检索的召回、过滤和排序摘要。

#### Scenario: 执行 hybrid search
- **WHEN** 系统执行 artifact 或 exercise hybrid search
- **THEN** AiRunTrace SHOULD 记录 `rag_query` 或等价 step
- **AND** step SHOULD 包含 query、过滤条件、召回数量、过滤数量、rerank 摘要和最终候选 id
- **AND** trace MUST 遵守权限和字段长度限制

### Requirement: Artifact hybrid search 必须可作为只读 LLM 工具执行
系统 SHALL 将 artifact hybrid search 作为只读 LLM 工具能力暴露，但不得改变现有权限、过滤和摘要边界。

#### Scenario: LLM 触发 artifact 检索
- **WHEN** LLM 通过只读 tool loop 请求 `searchArtifacts`
- **THEN** 系统 MUST 使用当前用户上下文执行检索
- **AND** 检索 MUST 遵守 `userId`、`status`、`kind`、`sessionScope` 和 `limit` 过滤
- **AND** 返回给模型的结果 MUST 只包含候选摘要和可解释排序信息

#### Scenario: 检索无结果
- **WHEN** `searchArtifacts` 没有返回当前用户可访问候选
- **THEN** tool result MUST 表达 `not_found` 或等价失败摘要
- **AND** 系统 MUST NOT 让 LLM 继续猜测候选外 artifactId

### Requirement: Exercise search 必须可作为只读 LLM 工具执行
系统 SHALL 提供受控 `searchExercises` 工具，让 LLM 可以按结构化条件补查动作摘要。

#### Scenario: LLM 触发动作检索
- **WHEN** LLM 通过只读 tool loop 请求 `searchExercises`
- **THEN** 系统 MUST 使用受控动作查询服务执行检索
- **AND** 检索 MUST 遵守动作库可见性、器械、肌群、section、训练目标和用户反馈边界
- **AND** 返回给模型的结果 MUST 是动作摘要、动作 id 和可解释匹配原因

#### Scenario: 动作检索结果用于推荐解释
- **WHEN** 工具结果用于解释动作推荐或替代候选
- **THEN** 回复 MUST 只引用工具结果中的真实动作
- **AND** 系统 MUST NOT 生成不存在于数据库的 exerciseId

### Requirement: LLM 工具检索必须进入 RAG Trace
系统 SHALL 对由 LLM 触发的 artifact 或 exercise 检索记录 RAG 诊断摘要。

#### Scenario: LLM 触发 hybrid search
- **WHEN** 只读 tool loop 执行 artifact 或 exercise hybrid search
- **THEN** AiRunTrace MUST 记录 `rag_query` 或等价 step
- **AND** step MUST 包含 query、过滤条件、召回数量、过滤数量、rerank 摘要和最终候选 id
- **AND** step MUST 能关联对应的 `tool_call` step

