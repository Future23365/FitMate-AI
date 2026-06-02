## ADDED Requirements

### Requirement: Agent 读工具必须区分事实读取和执行候选查询
统一 `AgentToolRegistry` 中的读工具 SHALL 区分按 ID / limit 读取事实的工具和生成执行候选集合的查询工具，并为后者提供更严格的结构化输入、诊断和结果边界。

#### Scenario: 按 ID 读取事实工具
- **WHEN** Agent 调用 `getExerciseById`、`getArtifactPayload`、`listRecentArtifacts` 或 `getUserMemory`
- **THEN** 工具 MUST 按当前用户、权限、ID、scope 或 limit 读取事实
- **AND** 工具 MUST NOT 接收自由结构化 filters 来生成执行候选集合
- **AND** 工具结果 MUST 继续绑定当前 userId 和 session 上下文

#### Scenario: 执行候选查询工具
- **WHEN** Agent 调用 `searchExercises` 生成 `recommendation`、`routine`、`plan` 或 `patch` 候选集合
- **THEN** 工具 MUST 要求结构化查询 filters
- **AND** 工具 MUST 对字段白名单、合法 enum 和动作库 facet 做输入校验
- **AND** 工具 MUST 返回候选集合查询证据和可用于 repair 的 diagnostics

#### Scenario: Artifact search 风险记录
- **WHEN** Agent 调用 `searchArtifacts`
- **THEN** 工具 MUST 继续遵守 userId、sessionScope、kind、targetGoal、equipment 和 sessionMinutes 等现有过滤边界
- **AND** 本 change MUST NOT 改变 `searchArtifacts` 的召回或排序行为
- **AND** 后续若 artifact search 也用于执行型写入候选集合，系统 MUST 单独补充 artifact 查询证据合同

### Requirement: 模型可见工具摘要必须说明结构化查询边界
Agent 向模型暴露工具摘要时，系统 SHALL 明确哪些字段是 hard filters、哪些字段只是 query 或排序信号，避免模型把自然语言 query 当作执行约束。

#### Scenario: 暴露 searchExercises 摘要
- **WHEN** Agent 构造模型可见工具说明
- **THEN** `searchExercises` 摘要 MUST 列出可用的结构化 filters
- **AND** 摘要 MUST 标明执行型候选集合不能只依赖 `query`
- **AND** 摘要 MUST 标明 `query` 不是 hard constraint

#### Scenario: 工具输入 schema 摘要
- **WHEN** Agent 压缩工具 input schema 给模型
- **THEN** 数组 enum、对象字段、合法 candidateUse 和常用 facet 字段 MUST 保留可见
- **AND** 系统 MUST NOT 因 token 瘦身隐藏执行型候选所需的关键 filters
