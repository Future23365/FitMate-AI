## MODIFIED Requirements

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

## ADDED Requirements

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
