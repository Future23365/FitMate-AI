# readonly-llm-tool-calling Specification

## Purpose
TBD - created by archiving change enable-readonly-llm-tool-calling. Update Purpose after archive.
## Requirements
### Requirement: 旧只读 tool loop 必须迁入统一 Agent 工具体系
系统 SHALL 删除独立的只读-only LLM tool loop 生产能力。原只读工具的 Schema、权限、摘要、预算和 trace 边界 MUST 迁入统一 `AgentToolRegistry`，并由 Tool-first `AgentOrchestrator` 调用。

#### Scenario: Agent 需要读取 artifact 或动作数据
- **WHEN** Agent 需要搜索 artifact、读取 artifact payload、搜索动作或读取动作详情
- **THEN** Agent MUST 通过统一 `AgentToolRegistry` 调用对应读工具
- **AND** 工具执行 MUST 绑定当前 `userId`、`sessionId`、trace、预算和权限上下文
- **AND** 系统 MUST NOT 进入独立 `runReadonlyToolLoop`

#### Scenario: 旧 feature flag 存在
- **WHEN** 环境变量、配置或代码中仍存在 `ENABLE_READONLY_LLM_TOOLS`
- **THEN** 该开关 MUST NOT 控制生产 `/api/chat` 是否可以读取工具上下文
- **AND** 生产读工具可用性 MUST 由 Agent registry、工具权限和请求预算决定

#### Scenario: 旧只读工具测试迁移
- **WHEN** 自动化测试覆盖读工具
- **THEN** 测试 MUST 断言工具在 Agent registry 中注册并经过 Schema、权限和摘要边界
- **AND** 测试 MUST NOT 继续断言独立只读 loop 的触发矩阵、stop reason 或旧固定编排路径

#### Scenario: searchExercises 工具定义暴露受控 facet
- **WHEN** Agent decision 模型看到 `searchExercises` 的工具定义
- **THEN** 工具定义 MUST 明确要求优先使用结构化筛选字段，包括 `bodyRegions`、`allowedSections`、`level`、`equipment` 或 `equipmentRequired`
- **AND** 工具定义 MUST 提供短小的真实动作库 facet 摘要或示例
- **AND** 工具定义 MUST NOT 要求模型猜测数据库不存在的 `targetMuscles` 或 `equipment` 值

### Requirement: 发布态动作库必须支持推荐检索
系统 SHALL 保证用于本地种子和开发验证的动作数据默认可被 `visibility: "published"` 的 `searchExercises` 检索到。

#### Scenario: 种子动作写入发布态
- **WHEN** seed 脚本写入动作库记录
- **THEN** 每条动作记录的 `isPublished` MUST 默认为 `true`
- **AND** seed 脚本 MUST 保留显式传入的 `isPublished` 发布态

#### Scenario: 静态动作数据发布态一致
- **WHEN** 系统读取 `data/exercises.zh.json` 作为动作种子来源
- **THEN** 文件中的动作记录 MUST 全部包含 `isPublished: true`

#### Scenario: 发布态检索能召回弹力带臀腿候选
- **WHEN** Agent 或只读工具使用 `visibility: "published"`、`equipmentRequired` 包含 `弹力带`、`level` 为 `beginner`，并按臀腿相关肌群检索动作
- **THEN** `searchExercises` MUST 能从已发布动作库中返回候选
- **AND** 系统 MUST NOT 因种子数据默认未发布而返回空候选集合

### Requirement: Agent 读工具必须暴露动作 facet 使用边界
系统 SHALL 在统一 `AgentToolRegistry` 的动作读工具摘要中暴露必要的筛选边界，使模型能区分真实动作 facet、高层身体区域和自由文本查询。

#### Scenario: Agent 查看 searchExercises 工具定义
- **WHEN** Agent decision prompt 包含 `searchExercises` 工具定义
- **THEN** 工具摘要 MUST 描述 `targetMuscles` 只能使用动作库真实肌群 facet
- **AND** 工具摘要 MUST 描述高层身体区域应使用 `bodyRegions`
- **AND** 工具摘要 MUST 提供可用于常见训练请求的身体区域枚举

#### Scenario: searchExercises 返回失败
- **WHEN** Agent registry 中的 `searchExercises` 工具返回失败
- **THEN** 失败结果 MUST 保留结构化 `detail`
- **AND** `detail` MUST 能表达该失败是否可恢复
- **AND** Agent 后续决策 prompt MUST 能看到可用于 retry 的诊断摘要

### Requirement: Agent 读工具必须暴露 artifact revision 恢复摘要
系统 SHALL 让统一 `AgentToolRegistry` 中的 artifact payload 读工具返回模型可引用的 payload 结果 id，并在发生 revision 恢复时返回稳定摘要。

#### Scenario: getArtifactPayload 恢复旧 revision
- **WHEN** Agent 通过 `getArtifactPayload` 读取 superseded artifact id
- **AND** 服务端恢复到同 lineage 的 active artifact
- **THEN** 工具结果 MUST 包含 `artifactPayloadId`
- **AND** 工具结果摘要 MUST 包含 requested artifact id、active artifact id 和 revision resolution 状态
- **AND** 模型后续步骤 MUST 能基于该结果继续引用真实 payload，而不是从 recent summary 重建 payload

### Requirement: Agent runtime 必须熔断重复不可重试工具失败
系统 SHALL 在单次 Agent run 内识别同一工具、同一归一化输入、同一不可重试失败码的重复调用，并阻止底层工具被反复执行。

#### Scenario: 重复读取同一个不可访问 artifact
- **WHEN** Agent 已经使用相同输入调用 `getArtifactPayload` 并得到 `not_found`、`forbidden` 或等价不可重试失败
- **AND** 模型后续再次请求相同工具和相同归一化输入
- **THEN** runtime MUST 返回结构化 duplicate failure 或等价熔断结果
- **AND** runtime MUST 引用首次失败的 tool result id
- **AND** runtime MUST NOT 再次执行底层 artifact 读取

#### Scenario: 修复后的不同输入仍可执行
- **WHEN** Agent 上一次工具失败后，模型后续请求同一工具但输入已经改变
- **THEN** runtime MUST 允许执行该工具
- **AND** runtime MUST NOT 因工具名相同而熔断不同输入

### Requirement: 写能力不得通过只读 tool loop 暴露给 LLM

系统 SHALL 废弃“只读 tool loop 不能参与写决策”的主链限制。写能力 MAY 通过统一 Agent tool loop 暴露给 LLM，但 MUST 以受控写工具形式执行，并且每次写入都必须经过 Schema、权限、候选集合、Validator、Policy、Confirmation 和 Persistence 边界。

#### Scenario: LLM 请求执行写操作
- **WHEN** LLM 通过 Agent 工具请求创建 draft、应用 Patch、保存 artifact revision、记录训练变更或修改未来安排
- **THEN** 对应写工具 MUST 校验其输入和前置 tool result
- **AND** 写工具输入 MUST 引用当前 run 内已登记的 `toolResultId`、`candidateSetId`、`validationId`、`policyDecisionId` 或 `confirmationId`
- **AND** 写工具 MUST 拒绝越权、候选外、未校验、未确认或超出 scope 的写入
- **AND** 写工具 MUST 返回结构化成功、失败或需要确认结果

#### Scenario: 工具 registry 被测试检查
- **WHEN** 自动化测试枚举 Agent registry
- **THEN** 测试 MUST 断言每个写工具都有 Schema、权限上下文、前置校验声明、tool result id 依赖、trace 摘要和失败路径
- **AND** 测试 MUST 断言不存在任意 SQL、任意函数调用或绕过 Validator/Policy 的写工具

### Requirement: Agent 工具不得退化为旧服务端补丁入口

系统 SHALL 禁止把旧 intent normalize、ReferenceResolver-first 触发矩阵、summary-only 上下文、只读触发矩阵或服务端关键词规则包装成 Agent 工具后继续驱动主链。

#### Scenario: 工具实现复用旧服务
- **WHEN** Agent 工具复用现有服务端函数
- **THEN** 工具 MUST 只复用权限、数据库读取、候选过滤、Validator、Policy、Persistence 等硬边界
- **AND** 工具 MUST NOT 复用旧服务端自然语言关键词分流、intent normalize 或 summary 反推逻辑

#### Scenario: 生成工具实现
- **WHEN** `generateRoutineDraft` 或 `generatePlanDraft` 被注册为 Agent 工具
- **THEN** 工具 MUST 接收结构化 intent/edit plan、candidateSetId 和 ContextPackage 摘要
- **AND** 工具 MUST NOT 只接收用户原文和 summary 后让 LLM 自由生成完整训练

### Requirement: Agent tool loop 不得因旧只读预算跳过必要查询

系统 SHALL 保留最大步骤、超时和异常回退，但不得因为 token 成本或旧只读工具触发矩阵跳过完成用户请求所必需的事实查询。

#### Scenario: 多轮调整需要读取 artifact
- **WHEN** 用户请求调整已有训练内容
- **THEN** Agent MUST 能调用 recent artifact 和 payload 读取工具
- **AND** 系统 MUST NOT 因旧只读 tool loop 关闭、旧触发矩阵不匹配或 token 裁剪策略跳过必要查询

### Requirement: Agent registry 必须暴露模型可执行的工具输入摘要

系统 SHALL 在统一 `AgentToolRegistry` 暴露给 Agent decision 模型的工具定义中提供可执行的轻量输入摘要。该摘要 MUST 保留完成工具调用所需的结构边界，并 MUST NOT 只提供复杂字段的顶层字段名。

#### Scenario: 模型查看包含嵌套对象的工具定义

- **WHEN** Agent decision prompt 包含带有对象字段的工具定义
- **THEN** 工具输入摘要 MUST 在受控深度内暴露该对象字段的子字段
- **AND** 子字段摘要 MUST 保留 required、enum、const、default、数组 item 和数值边界等结构信息
- **AND** 摘要 MUST 保持轻量，不得把完整 JSON Schema 原样发送给模型

#### Scenario: 模型查看包含 record 字段的工具定义

- **WHEN** Agent decision prompt 包含 `z.record` 或 JSON Schema `additionalProperties` 形态的工具字段
- **THEN** 工具输入摘要 MUST 暴露动态 key 对应的 value 结构
- **AND** 当 value 是对象时，摘要 MUST 在受控深度内暴露其子字段

#### Scenario: 模型查看 searchExercises 工具定义

- **WHEN** Agent decision prompt 包含 `searchExercises` 的工具定义
- **THEN** 摘要 MUST 表达 `resultRequirements.sectionCoverage` 是 record/object 结构
- **AND** 摘要 MUST 表达 `sectionCoverage` 的 value 包含 `min`
- **AND** 摘要 MUST 表达 `softPreferences` 只接受已声明的偏好字段
- **AND** 摘要 MUST 表达 `query` 是顶层字段，而不是 `softPreferences.query`

#### Scenario: 模型查看复杂生成和策略工具定义

- **WHEN** Agent decision prompt 包含 `generateRoutineDraft`、`generatePlanDraft` 或 `evaluatePolicy` 的工具定义
- **THEN** 摘要 MUST 暴露 `intent`、`strategy` 或 union 分支中的关键字段结构
- **AND** union 分支 MUST 保留判别字段的 const 或 enum 边界
- **AND** 模型 MUST 能从摘要中区分不同分支的必填字段

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

