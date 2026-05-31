## ADDED Requirements

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
