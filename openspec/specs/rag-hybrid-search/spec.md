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
系统 SHALL 提供受控 `searchExercises` 工具，让 LLM 可以按结构化条件补查动作摘要；当该工具生成 `recommendation`、`routine`、`plan` 或 `patch` 等执行型候选集合时，系统 SHALL 将其作为结构化动作查询执行器，而不是依赖自然语言 query 表达 hard constraint。

#### Scenario: LLM 触发动作检索
- **WHEN** LLM 通过只读 tool loop 请求 `searchExercises`
- **THEN** 系统 MUST 使用受控动作查询服务执行检索
- **AND** 检索 MUST 遵守动作库可见性、器械、肌群、section、训练目标和用户反馈边界
- **AND** 返回给模型的结果 MUST 是动作摘要、动作 id 和可解释匹配原因

#### Scenario: 执行型动作检索使用结构化 filters
- **WHEN** Agent 调用 `searchExercises`
- **AND** `candidateUse` 是 `recommendation`、`routine`、`plan` 或 `patch`
- **THEN** 工具输入 MUST 包含 `operation=build_exercise_candidate_set` 或等价操作标识
- **AND** 工具输入 MUST 包含足以表达候选边界的结构化 filters
- **AND** filters MUST 仅包含系统白名单字段和合法 enum / facet 值
- **AND** 系统 MUST NOT 仅凭 `query` 或自由文本偏好生成执行型候选集合

#### Scenario: 执行型动作检索声明结果要求
- **WHEN** Agent 调用 `searchExercises`
- **AND** `candidateUse` 是 `routine`、`plan` 或 `patch`
- **THEN** 工具输入 MUST 能声明 result requirements，例如最少候选数量、section 覆盖、是否必须可用于 routine / plan / patch、是否必须返回 proof
- **AND** `searchExercises` MUST 校验结果集合是否满足这些 result requirements
- **AND** 如果合法候选不满足 result requirements，工具 MUST 返回 `insufficient_candidates`、`result_requirement_unmet` 或等价可恢复失败
- **AND** 系统 MUST NOT 放宽 hard filters 后返回成功

#### Scenario: 结构化过滤严格执行
- **WHEN** `searchExercises` 接收到合法 filters
- **THEN** 系统 MUST 在返回候选前按 filters 执行确定性 hard filter
- **AND** 不满足 filters 的动作 MUST NOT 出现在最终候选集合中
- **AND** text/vector/RAG score MUST NOT 绕过结构化 hard filter

#### Scenario: Query 不承载 hard constraint
- **WHEN** `searchExercises` 同时接收到 `query` 和结构化 filters
- **AND** `candidateUse` 是执行型候选用途
- **THEN** `query` MUST 只能作为召回或排序信号
- **AND** 系统 MUST NOT 将 `query` 中的自然语言内容解释为额外 hard filter
- **AND** 系统 MUST NOT 因 `query` 文本没有覆盖某个 filter 而放宽已经传入的 filters

#### Scenario: 旧字段兼容只处理显式结构化字段
- **WHEN** 旧输入字段如 `equipmentRequired`、`equipmentAvoided`、`allowedSections` 或 `bodyRegions` 被保留兼容
- **THEN** 系统 MAY 将这些显式结构化字段规范化进新 filters
- **AND** 规范化结果 MUST 出现在 `normalizedQueryInput` 和 `appliedFilters`
- **AND** 系统 MUST NOT 从 `query`、`preferences`、`avoidances` 或用户原文中解析隐藏 hard filters

#### Scenario: 无效 filter 返回可恢复诊断
- **WHEN** LLM 传入未知字段、非法 enum 或动作库不存在的 facet 值
- **THEN** `searchExercises` MUST 返回结构化失败或 retryable diagnostics
- **AND** diagnostics MUST 包含无效字段、无效值和可用于重查的合法字段摘要
- **AND** 系统 MUST NOT 静默丢弃无效 hard filter 后继续返回执行型候选集合

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

### Requirement: 执行型动作候选集合必须记录查询证据
系统 SHALL 为 `searchExercises` 生成的执行型 candidate set 记录规范化查询输入、已执行过滤和候选满足证明，供后续生成、校验和 trace 使用。

#### Scenario: 成功生成候选集合
- **WHEN** `searchExercises` 成功返回执行型候选集合
- **THEN** tool result MUST 包含 `candidateSetId`
- **AND** tool result MUST 记录规范化后的结构化查询输入
- **AND** tool result MUST 记录实际执行的 hard filters
- **AND** tool result MUST 记录 result requirements 和满足状态
- **AND** tool result MUST 记录最终返回 exerciseIds

#### Scenario: 候选满足证明
- **WHEN** `searchExercises` 返回某个 exerciseId
- **THEN** diagnostics 或 trace MUST 能证明该动作满足本次 hard filters
- **AND** proof MUST 至少覆盖器械或居家条件、肌群或身体区域、section、难度、风险排除和可见性中本次实际传入的字段
- **AND** proof MUST 遵守现有 trace 字段长度和隐私限制

#### Scenario: 结果要求证明
- **WHEN** `searchExercises` 返回执行型 candidate set
- **THEN** diagnostics 或 trace MUST 能证明 candidate set 满足本次 result requirements
- **AND** proof MUST 覆盖最少候选数量、section 覆盖、可用于 routine / plan / patch 的资源边界和 proof 是否完整
- **AND** 如果某个 result requirement 未满足，candidate set MUST NOT 被登记为 `satisfied=true`

#### Scenario: 查询证据被后续工具引用
- **WHEN** 后续工具引用 `candidateSetId`
- **THEN** runtime MUST 能读取该候选集合的查询证据
- **AND** 后续工具 MUST NOT 只凭模型重新提交的 `candidateExerciseIds` 判断候选边界

#### Scenario: 自动恢复不能改变 hard filters
- **WHEN** `searchExercises` 发现候选不足、facet 无效或 result requirements 未满足
- **THEN** 工具 MAY 返回 suggested filters、available facets 或 retry diagnostics
- **AND** 工具 MUST NOT 在同一次成功结果中自动删除、替换或放宽 hard filters
- **AND** 任何放宽约束的重查都 MUST 由 LLM 在新的 ToolRequest 中显式提交

