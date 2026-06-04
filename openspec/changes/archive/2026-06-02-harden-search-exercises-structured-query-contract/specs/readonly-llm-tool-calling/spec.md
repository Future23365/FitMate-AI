## ADDED Requirements

### Requirement: Agent 读工具必须区分事实读取和执行候选查询
统一 `AgentToolRegistry` 中的读工具 SHALL 区分按 ID / limit 读取事实的工具和生成执行候选集合的查询工具，并为后者提供更严格的结构化输入、诊断和结果边界。

#### Scenario: 按 ID 读取事实工具
- **WHEN** Agent 调用 `getExerciseById`、`getArtifactPayload`、`listRecentArtifacts` 或 `getUserMemory`
- **THEN** 工具 MUST 按当前用户、权限、ID、scope 或 limit 读取事实
- **AND** 工具 MUST NOT 接收自由结构化 filters 来生成执行候选集合
- **AND** 工具结果 MUST 继续绑定当前 userId 和 session 上下文
- **AND** 模型可见摘要 MUST 明确这些工具不负责复杂语义定位或候选执行查询

#### Scenario: 执行候选查询工具
- **WHEN** Agent 调用 `searchExercises` 生成 `recommendation`、`routine`、`plan` 或 `patch` 候选集合
- **THEN** 工具 MUST 要求结构化查询 filters
- **AND** 工具 MUST 对字段白名单、合法 enum 和动作库 facet 做输入校验
- **AND** 工具 MUST 返回候选集合查询证据和可用于 repair 的 diagnostics

#### Scenario: Artifact search 风险记录
- **WHEN** Agent 调用 `searchArtifacts`
- **THEN** 工具 MUST 继续遵守 userId、sessionScope、kind、targetGoal、equipment 和 sessionMinutes 等权限与过滤边界
- **AND** 工具 MUST 明确哪些 artifact 引用语义可以通过当前参数严格执行
- **AND** 当 LLM 想定位的 artifact 语义无法由当前参数表达、结果不唯一或候选证据不足时，工具 MUST 返回结构化失败、候选歧义或要求澄清
- **AND** 工具 MUST NOT 静默选择一个 artifact 并伪装成已精确命中用户引用

#### Scenario: Artifact reference resolution
- **WHEN** LLM 需要解析“上一套”“刚才那版”“最近保存的上肢 routine”“把刚生成的计划换成无器械”等引用
- **THEN** 系统 MUST 提供 `resolveArtifactReference` 或等价 tool，输入可表达 artifact kind、session scope、recency、saved/generated 状态、targetGoal、equipment filters 和唯一性要求
- **AND** 工具成功时 MUST 返回唯一 artifactId、解析证据和 matched constraints
- **AND** 工具失败时 MUST 返回 ambiguous candidates、unsupported reference 或 not found diagnostics
- **AND** 系统 MUST NOT 让 `searchArtifacts` 在结果不唯一时隐式选第一个候选

#### Scenario: User memory query 边界
- **WHEN** Agent 调用 `getUserMemory`
- **THEN** 工具 MUST 明确它返回的是用户画像和记忆快照还是按结构化 filters 查询的记忆
- **AND** 如果 LLM 需要“查某类限制、偏好、未确认记忆或特定 subject”但当前输入不能表达，工具 MUST 返回不支持或要求补充结构化参数
- **AND** 工具 MUST NOT 把不完整 snapshot 伪装成已覆盖所有用户长期约束

#### Scenario: Structured user memory query
- **WHEN** LLM 需要查询用户某类限制、偏好、避免项、历史反馈、未确认记忆或特定 subject
- **THEN** 系统 MUST 提供 `queryUserMemory` 或等价 tool，输入可表达 kind、subjectType、status、confirmed、source、limit 和 projection
- **AND** 工具结果 MUST 返回 matched memory ids、matched filters、coverage diagnostics 和 snapshot freshness
- **AND** 如果现有 memory 数据无法证明覆盖该查询，工具 MUST 返回 `unverifiable_result` 或等价诊断
- **AND** 系统 MUST NOT 用完整 snapshot 的存在替代结构化 memory query 的证明

### Requirement: 模型可见工具摘要必须说明结构化查询边界
Agent 向模型暴露工具摘要时，系统 SHALL 明确哪些字段是 hard filters、哪些字段只是 query 或排序信号，避免模型把自然语言 query 当作执行约束。

#### Scenario: 暴露 searchExercises 摘要
- **WHEN** Agent 构造模型可见工具说明
- **THEN** `searchExercises` 摘要 MUST 列出可用的结构化 filters
- **AND** 摘要 MUST 列出执行型候选的 result requirements，例如最少候选数和 section 覆盖
- **AND** 摘要 MUST 标明执行型候选集合不能只依赖 `query`
- **AND** 摘要 MUST 标明 `query` 不是 hard constraint

#### Scenario: 更新 Agent 决策 Prompt
- **WHEN** Agent 构造 `agent_tool_decision` prompt module
- **THEN** prompt MUST 引导 LLM 在执行型 `searchExercises` 调用中提交 `operation`、结构化 filters 和必要 result requirements
- **AND** prompt MUST 明确用户明确约束不能只写入 `query`、`preferences`、`avoidances` 或 reason
- **AND** prompt MUST 明确 `query` 只用于召回或排序，不是 hard constraint
- **AND** prompt MUST 引导 LLM 对结构化失败 diagnostics 执行 repair、retry、clarification、blocked 或 failed，而不是继续消费失败资源

#### Scenario: 暴露 artifact 和 memory 工具摘要
- **WHEN** Agent 构造模型可见工具说明
- **THEN** `searchArtifacts` 摘要 MUST 明确它是搜索候选，不保证唯一引用解析
- **AND** `resolveArtifactReference` 摘要 MUST 明确唯一命中、歧义和 unsupported reference 的返回语义
- **AND** `getUserMemory` 摘要 MUST 明确它是 snapshot 读取
- **AND** `queryUserMemory` 摘要 MUST 明确可用结构化 filters 和 unverifiable diagnostics

#### Scenario: 工具输入 schema 摘要
- **WHEN** Agent 压缩工具 input schema 给模型
- **THEN** 数组 enum、对象字段、合法 candidateUse 和常用 facet 字段 MUST 保留可见
- **AND** 系统 MUST NOT 因 token 瘦身隐藏执行型候选所需的关键 filters
