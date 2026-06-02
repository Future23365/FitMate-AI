## ADDED Requirements

### Requirement: Agent Tool 合同必须逐项可审计

系统 SHALL 为每个注册到 `AgentToolRegistry` 的 Agent Tool 保留可人工审计的合同说明。合同说明 MUST 覆盖 Tool 输入、依赖资源、执行内容、返回结果、失败条件和禁止行为。

#### Scenario: 人工审查 Tool 合同
- **WHEN** 开发者打开本 change 的 Tool 合同审计文档
- **THEN** 文档 MUST 列出所有当前 Agent Tools
- **AND** 每个 Tool MUST 说明 LLM 需要传什么
- **AND** 每个 Tool MUST 说明服务端会执行什么
- **AND** 每个 Tool MUST 说明服务端返回什么
- **AND** 每个 Tool MUST 说明该 Tool 不允许执行什么

#### Scenario: 新增 Agent Tool
- **WHEN** 后续新增 Agent Tool
- **THEN** 对应 OpenSpec change MUST 补充该 Tool 的合同说明
- **AND** 实现 MUST 与合同说明一致

### Requirement: 生成类 Agent Tool 必须登记 LLM-authored draft

生成类 Agent Tool SHALL 接收 LLM 已经产出的结构化业务草稿，并将该草稿登记为本轮可引用资源。生成类 Tool MUST NOT 根据候选动作、动作元数据、用户原文或本地规则自行生成训练语义草稿。

#### Scenario: Routine draft 工具输入
- **WHEN** LLM 调用 `generateRoutineDraft`
- **THEN** 输入 MUST 包含 LLM-authored `WorkoutRoutineDraft` 或等价完整 structured sections
- **AND** 输入 MUST 引用本轮已满足的 `candidateSetId`
- **AND** 输入 MUST 列出 draft 使用的 `candidateExerciseIds`

#### Scenario: Plan draft 工具输入
- **WHEN** LLM 调用 `generatePlanDraft`
- **THEN** 输入 MUST 包含 LLM-authored `WorkoutPlanDraft` 或等价完整 structured plan
- **AND** 输入 MUST 引用本轮已满足的 `candidateSetId`
- **AND** 输入 MUST 列出 draft 使用的 `candidateExerciseIds`

#### Scenario: 服务端登记 draft
- **WHEN** 生成类 Tool 收到合法 LLM-authored draft
- **THEN** 服务端 MUST 解析 draft schema
- **AND** 服务端 MUST 校验动作候选边界
- **AND** 服务端 MUST 登记 `draftId`
- **AND** 服务端 MUST NOT 重写 draft 的 section、day、exerciseId 或训练语义

### Requirement: Agent Tool 不得读取自然语言补语义

Agent Tool SHALL 只执行输入 schema 中已经表达的结构化参数。Tool MUST NOT 读取 `latestUserMessage`、query 文本、标题、summary 或历史摘要来补齐业务语义。

#### Scenario: Tool 输入缺少业务语义
- **WHEN** LLM 调用 Tool 但没有传入该操作所需结构化字段
- **THEN** Tool MUST 返回结构化失败
- **AND** Tool MUST NOT 从用户原文或历史摘要自行推断该字段

#### Scenario: 需要语义修复
- **WHEN** draft 或 ToolRequest 的业务语义不完整
- **THEN** Agent MUST 让 LLM repair、重新调用候选工具或向用户澄清
- **AND** 服务端 MUST NOT 用本地规则补写语义结果
