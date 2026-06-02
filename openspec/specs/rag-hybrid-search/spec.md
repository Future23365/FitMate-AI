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
- **WHEN** Agent 通过 `searchArtifacts` 使用 hybrid search 搜索 artifact
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

#### Scenario: 推荐检索已有结构化候选边界
- **WHEN** `searchExercises` 使用 `candidateUse="recommendation"` 执行动作检索
- **AND** 请求包含 `bodyRegions`、`targetMuscles`、`equipmentRequired`、`equipment`、`allowedSections`、`goal` 或 `sessionMinutes` 等结构化候选边界
- **THEN** 系统 MUST 先执行结构化 hard filters
- **AND** `query` MUST 只作为候选排序提示
- **AND** `query` MUST NOT 作为硬召回条件清空已满足结构化边界的候选
- **AND** 若仍无候选，诊断原因 MUST 指向结构化过滤结果或 facet 问题，而不是误报为单纯 `no_hybrid_match`

### Requirement: LLM 工具检索必须进入 RAG Trace
系统 SHALL 对由 LLM 触发的 artifact 或 exercise 检索记录 RAG 诊断摘要。

#### Scenario: LLM 触发 hybrid search
- **WHEN** 只读 tool loop 执行 artifact 或 exercise hybrid search
- **THEN** AiRunTrace MUST 记录 `rag_query` 或等价 step
- **AND** step MUST 包含 query、过滤条件、召回数量、过滤数量、rerank 摘要和最终候选 id
- **AND** step MUST 能关联对应的 `tool_call` step

### Requirement: Agent 检索工具必须使用结构化过滤参数

系统 SHALL 要求 Agent 通过结构化参数调用 artifact 和 exercise 检索工具。用户原始消息 MAY 作为辅助语义 query，但 MUST NOT 成为唯一检索输入。

#### Scenario: 搜索动作
- **WHEN** Agent 调用 `searchExercises` 或等价动作检索工具
- **THEN** 工具输入 MUST 支持 `goal`、`targetMuscles`、`equipmentRequired`、`equipmentAvoided`、`location`、`level`、`sessionMinutes`、`preferences` 和 `avoidances` 等结构化字段
- **AND** 服务端 MUST 先执行结构化硬过滤，再执行全文、向量或语义 rerank
- **AND** 返回给 LLM 的 exerciseId MUST 来自数据库
- **AND** 工具 MUST 返回 `candidateSetId`，供后续 draft、Patch 或保存工具引用

#### Scenario: 搜索 artifact
- **WHEN** Agent 调用 `searchArtifacts`
- **THEN** 工具输入 MUST 支持 `kind`、`sessionScope`、`targetGoal`、`equipmentRequired`、`equipmentAvoided`、`sessionMinutes` 和 `query` 等结构化字段
- **AND** 搜索 MUST 按当前 `userId`、status、scope 和 session 边界过滤
- **AND** LLM MUST NOT 选择候选集合之外的 artifactId
- **AND** 工具 MUST 返回 `candidateSetId` 或等价结果 id，供后续 payload 读取和 edit plan 引用

#### Scenario: 用户表达否定约束
- **WHEN** 用户表达不用某器械、不要某动作类型、避免某偏好或等价否定条件
- **THEN** Agent MUST 将该条件传入结构化 `equipmentAvoided`、`avoidances` 或等价字段
- **AND** 搜索工具 MUST NOT 把被否定词作为正向匹配加分依据

#### Scenario: 只有原始自然语言 query
- **WHEN** Agent 调用检索工具时只提供用户原始消息或裸 query
- **THEN** 工具 MUST 拒绝用于可执行动作推荐、Patch、routine 或 plan 的候选集合
- **AND** Agent MUST 补充结构化字段、读取更多上下文或进入澄清
- **AND** 系统 MUST NOT 用裸 query 检索结果触发写入或训练卡片

#### Scenario: 候选集合过期或不匹配
- **WHEN** 后续工具引用 candidateSetId
- **THEN** 系统 MUST 校验 candidateSetId 属于当前 run、当前 userId、当前目标和未过期状态
- **AND** 系统 MUST 拒绝候选集合外的 exerciseId 或 artifactId

