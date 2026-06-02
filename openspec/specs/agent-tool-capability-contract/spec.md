# agent-tool-capability-contract Specification

## Purpose
TBD - created by archiving change harden-search-exercises-structured-query-contract. Update Purpose after archive.
## Requirements
### Requirement: Agent tools 必须声明能力合同
统一 `AgentToolRegistry` 中的每个 tool SHALL 声明可执行能力、输入合同、执行合同、拒绝条件、产出资源和执行证据，使 Tool-first 架构不依赖 prompt 文案或 runtime 特例猜测工具语义。

#### Scenario: 注册 tool 能力合同
- **WHEN** 系统注册 Agent tool
- **THEN** tool definition MUST 包含能力合同或可规范化为能力合同的元数据
- **AND** 能力合同 MUST 声明 operationKind、inputContract、executionContract、refusesWhen、produces、evidence 和 unsupportedOperations
- **AND** runtime、模型可见工具摘要、dependency graph、trace 和测试 MUST 基于同一份能力合同

#### Scenario: 缺少能力合同
- **WHEN** 某个 Agent tool 缺少能力合同
- **THEN** 系统 MUST 将该 tool 视为不能执行复杂业务语义的严格工具
- **AND** 系统 MUST NOT 从工具名、description、prompt 文案或历史 trace 隐式推断它能执行的操作

#### Scenario: 模型可见摘要
- **WHEN** Agent 向 LLM 暴露工具列表和输入边界
- **THEN** 模型可见摘要 MUST 来自 tool 能力合同
- **AND** 摘要 MUST 明确哪些字段是 hard contract、哪些字段只是排序或显示信号
- **AND** 摘要 MUST 明确该 tool 不能执行的常见操作

### Requirement: LLM 调用复杂 tool 时必须提交结构化 ToolRequest
Agent SHALL 要求 LLM 对复杂业务 tool 提交可执行的结构化 ToolRequest，明确 operation、hard constraints、soft preferences、result requirements 和 projection，而不是只用自然语言 query 表达期望结果。

#### Scenario: ToolRequest 表达执行目标
- **WHEN** LLM 调用 `structured_search`、`reference_resolution`、`memory_query`、`candidate_to_draft`、`edit_plan_compile`、`patch_compile`、`validation`、`policy` 或 `persistence` 类 tool
- **THEN** tool input MUST 能表达本次调用的 operation
- **AND** tool input MUST 能区分 hard constraints、soft preferences、result requirements 和 projection
- **AND** tool input schema MUST 明确哪些字段会影响结果合法性，哪些字段只影响排序、摘要或解释

#### Scenario: ToolRequest 无法表达目标
- **WHEN** LLM 想执行的操作无法用当前 tool input schema 表达
- **THEN** tool MUST 返回 `unsupported_operation`、`missing_required_parameter` 或等价结构化失败
- **AND** 系统 MUST NOT 让 tool 通过读取用户原文、query 文本、标题或历史摘要补出隐藏目标
- **AND** change implementation MUST 新增、拆分或调整 tool 能力，而不是把该语义塞进自由文本字段

#### Scenario: 模型可见 schema 被压缩
- **WHEN** Agent 为节省 token 压缩工具 schema 或工具摘要
- **THEN** 摘要 MUST 保留 operation、hard constraint 字段、result requirement 字段、关键 enum、拒绝条件和 query 语义
- **AND** 系统 MUST NOT 隐藏 LLM 正确调用 tool 所必需的结构化字段

### Requirement: ToolResult 必须证明满足 ToolRequest
复杂 Agent tool SHALL 在成功结果或 trace 中证明输出满足本次 ToolRequest；无法证明时 SHALL 返回结构化失败或 `satisfied=false` 的不可消费结果。

#### Scenario: ToolResult 满足请求
- **WHEN** tool 成功完成 LLM 提交的 ToolRequest
- **THEN** tool result 或 trace MUST 记录 operation、producedResources、appliedHardConstraints、evidence 和 diagnostics
- **AND** tool result MUST 表示请求已满足，例如 `satisfied=true` 或等价状态
- **AND** 后续工具 MUST 能追溯该资源由哪个 ToolRequest 产生

#### Scenario: ToolResult 不满足请求
- **WHEN** tool 执行后无法满足 hard constraints 或 result requirements
- **THEN** tool MUST 返回结构化失败或 `satisfied=false`
- **AND** runtime MUST NOT 将该结果登记为可被后续工具消费的成功资源
- **AND** failure diagnostics MUST 指明未满足的 constraint 或 result requirement

#### Scenario: 部分满足
- **WHEN** tool 只满足部分 soft preferences 但满足全部 hard constraints 和 result requirements
- **THEN** tool MAY 返回成功
- **AND** diagnostics SHOULD 记录未满足的 soft preferences
- **AND** tool MUST NOT 把 soft preference 未满足包装成 hard contract 已满足之外的额外承诺

### Requirement: Tool 必须严格执行 LLM 传入参数
Agent tool SHALL 只执行 LLM 传入并通过 schema 校验的结构化参数，不得读取用户原文或 query 文本自行补充高层语义。

#### Scenario: 参数完整且合法
- **WHEN** LLM 调用 tool 并传入完整合法参数
- **THEN** tool MUST 按参数执行对应操作
- **AND** tool MUST NOT 静默忽略 hard contract 字段
- **AND** tool MUST 返回能证明执行结果的 output、resource id 或 diagnostics

#### Scenario: 参数不足
- **WHEN** LLM 调用 tool 但缺少该操作必需参数
- **THEN** tool MUST 返回结构化失败
- **AND** 失败 MUST 指明缺少的参数或资源引用
- **AND** tool MUST NOT 从用户自然语言、历史摘要或标题自行补齐该参数

#### Scenario: 参数非法或能力不支持
- **WHEN** LLM 调用 tool 并传入非法字段、非法 enum、非法 facet、不存在资源或该 tool 不支持的操作
- **THEN** tool MUST 返回结构化失败
- **AND** 失败 MUST 区分 `invalid_parameter`、`unsupported_operation`、`ambiguous_resource` 或等价错误码
- **AND** tool MUST NOT 放宽参数后继续返回成功

#### Scenario: 结果无法证明
- **WHEN** tool 执行后无法证明结果满足 LLM 传入的 hard contract
- **THEN** tool MUST 返回失败或不可执行诊断
- **AND** tool MUST NOT 只通过修改标题、summary、reply 或 warning 声称成功

#### Scenario: 结果要求未满足
- **WHEN** LLM 传入合法 hard constraints，但 tool 返回结果不满足最少数量、唯一性、section 覆盖、可保存性或 proof 等 result requirements
- **THEN** tool MUST 返回 `result_requirement_unmet`、`insufficient_candidates`、`ambiguous_resource` 或等价结构化失败
- **AND** tool MUST NOT 自动放宽 hard constraints 后继续返回成功

### Requirement: Tool 能力类型必须覆盖当前 Agent 工具
系统 SHALL 按工具真实能力为当前 Agent tools 分类，并为每类定义严格执行边界。

#### Scenario: 事实读取类工具
- **WHEN** tool operationKind 是 `exact_read` 或 `list`
- **THEN** tool MUST 只按 ID、scope、kind、limit 或当前用户权限读取事实
- **AND** tool MUST NOT 承诺执行复杂语义查询
- **AND** LLM 若需要语义定位 MUST 先调用对应 structured search tool

#### Scenario: 结构化检索类工具
- **WHEN** tool operationKind 是 `structured_search` 或 `memory_query`
- **THEN** tool MUST 接收明确 filters 或 query 参数
- **AND** tool MUST 说明 query 是否参与 hard filter、召回或排序
- **AND** tool MUST 返回过滤证据、候选证据或无法执行诊断

#### Scenario: 引用解析类工具
- **WHEN** tool operationKind 是 `reference_resolution`
- **AND** LLM 需要定位“上一套”“刚生成那版”“最近那个无器械上肢计划”等 artifact 引用
- **THEN** 系统 MUST 使用能表达引用范围、artifact kind、session scope、时间关系、保存状态和唯一性要求的结构化 tool
- **AND** 如果现有 `searchArtifacts` 不能严格表达该引用，系统 MUST 新增或拆出 `resolveArtifactReference`
- **AND** 工具 MUST 返回唯一 artifact、候选歧义或无法解析失败，不能静默选择一个候选

#### Scenario: Memory snapshot 工具
- **WHEN** tool operationKind 是 `memory_snapshot`
- **THEN** tool MUST 只返回当前用户画像或记忆快照
- **AND** tool MUST NOT 承诺已经按某类限制、偏好或 subject 完成精确查询
- **AND** LLM 若需要精确查询 MUST 调用 `memory_query` 类 tool

#### Scenario: 记忆查询类工具
- **WHEN** tool operationKind 是 `memory_query`
- **AND** LLM 需要查询用户某类限制、偏好、未确认记忆或特定 subject
- **THEN** 系统 MUST 使用能表达 kind、subjectType、status、source、confirmed 或等价 filters 的结构化 memory query tool
- **AND** 如果现有 `getUserMemory` 只能返回 snapshot，模型可见摘要 MUST 如实声明该边界
- **AND** 工具 MUST NOT 把有限 snapshot 伪装成已严格查询全部长期约束

#### Scenario: 候选消费类工具
- **WHEN** tool operationKind 是 `candidate_to_draft` 或 `patch_compile`
- **THEN** tool MUST 验证输入资源来自当前 run 已登记结果
- **AND** tool MUST 继承并执行上游 candidate set 或 artifact payload 的边界
- **AND** tool MUST NOT 从全量数据源补入未被上游证据证明的资源

#### Scenario: 校验和策略类工具
- **WHEN** tool operationKind 是 `validation` 或 `policy`
- **THEN** tool MUST 只验证已登记资源和确定性合同
- **AND** tool MUST 返回可追踪 validationId、policyDecisionId、errors、warnings 或 blockedReasons
- **AND** tool MUST NOT 替 LLM 重新解释用户自然语言

#### Scenario: 保存类工具
- **WHEN** tool operationKind 是 `persistence`
- **THEN** tool MUST 只保存已通过 validation 和 policy 的资源
- **AND** tool MUST 返回真实 artifactId、revisionId 或 operationResultId
- **AND** tool MUST NOT 保存未证明满足 hard contract 的结果

### Requirement: Tool 执行证据必须进入 trace 和黑盒报告
系统 SHALL 在 Agent trace 和黑盒报告中记录每个 tool 的能力类型、输入摘要、执行结果、拒绝原因和关键证据。

#### Scenario: 成功执行
- **WHEN** tool 成功执行
- **THEN** trace MUST 记录 toolName、operationKind、operation、输入摘要、产出资源、satisfied 状态和关键 evidence
- **AND** 对 candidate set、draft、validation、policy 和 persistence 结果 MUST 能追溯 producer

#### Scenario: 执行失败
- **WHEN** tool 返回结构化失败
- **THEN** trace MUST 记录 failureCode、operationKind、缺失参数、非法参数、unsupported operation 或不可证明原因
- **AND** 黑盒报告 MUST 能区分 LLM 参数错误、tool 能力不足、候选不足、result requirement 未满足和 hard boundary 失败

