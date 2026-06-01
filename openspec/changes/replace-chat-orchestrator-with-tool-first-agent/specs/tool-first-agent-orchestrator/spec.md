## ADDED Requirements

### Requirement: /api/chat 必须使用 Tool-first AgentOrchestrator 作为主链

系统 SHALL 使用 Tool-first `AgentOrchestrator` 处理生产 `/api/chat` 请求。LLM SHALL 通过受控工具读取事实、查询动作、提出训练变更、请求校验和保存结果；服务端 SHALL 只执行工具、校验边界和写入结果。

#### Scenario: 聊天请求进入 Agent 主链
- **WHEN** 用户向 `/api/chat` 发送消息
- **THEN** 系统 MUST 构建 `AgentExecutionState`
- **AND** `AgentExecutionState` MUST 包含最新用户消息、真实 recent messages、recent artifact 摘要和可用用户记忆
- **AND** 系统 MUST 让 LLM 通过 Agent tool loop 决定下一步
- **AND** 系统 MUST NOT 先通过服务端关键词、正则、自然语言模板或旧 normalize 改写用户高层语义

#### Scenario: Agent 需要查询当前会话事实
- **WHEN** 用户消息依赖最近训练卡片、历史计划、动作库或用户记忆
- **THEN** LLM MUST 通过工具读取 `ConversationArtifact`、`ArtifactIndex`、动作库或用户记忆摘要
- **AND** 服务端 MUST NOT 从 summary 反向构造完整训练事实

#### Scenario: Agent 完成本轮执行
- **WHEN** Agent loop 结束
- **THEN** 系统 MUST 产出一个 `AgentExecutionResult`
- **AND** 最终回复、流事件、artifact 推送和 trace MUST 基于该结果
- **AND** 系统 MUST NOT 仅凭自然语言回复正文表达执行成功

### Requirement: AgentContextBuilder 必须成为 Agent 唯一上下文入口

系统 SHALL 通过 `AgentContextBuilder` 构造 `ContextPackage`，并将其作为 Agent 执行的唯一上下文入口。上下文选择、截断、来源和可信级别 MUST 可测试、可 trace、可复盘。

#### Scenario: 构造 ContextPackage
- **WHEN** `/api/chat` 准备进入 AgentOrchestrator
- **THEN** 系统 MUST 构造 `ContextPackage`
- **AND** `ContextPackage` MUST 包含 latestUserMessage、真实 recent messages、recent artifact 摘要、用户记忆摘要、pending confirmation 状态和 provenance
- **AND** `ContextPackage` MUST 记录每段上下文的来源 id、更新时间、截断策略和可信级别

#### Scenario: 上下文冲突
- **WHEN** recent messages、artifact 摘要、用户记忆或可选 ContextSnapshot 存在冲突
- **THEN** Agent MUST 优先通过工具读取结构化事实
- **AND** 系统 MUST NOT 让自然语言摘要覆盖 artifact payload、数据库 exercise 或已校验 tool result

#### Scenario: 需要完整事实
- **WHEN** Agent 需要 artifact payload、exerciseId、Patch target、训练参数或保存 payload
- **THEN** Agent MUST 调用对应工具读取结构化事实
- **AND** 系统 MUST NOT 从 recent message、summary、ContextSnapshot 或最终回复正文反向构造可写 payload

### Requirement: Agent 主链不得依赖 conversationSummary

系统 SHALL 从 `/api/chat` 主链移除对 `conversationSummary` 的必需依赖。Agent 的历史上下文 SHALL 来自真实 recent messages、recent artifacts、用户记忆和工具结果。

#### Scenario: 构造 Agent 输入
- **WHEN** 系统为 Agent 构造本轮输入
- **THEN** 输入 MUST 包含当前最新用户消息和受限数量的真实 recent messages
- **AND** 输入 MAY 包含 recent artifact 摘要和用户记忆摘要
- **AND** 输入 MUST NOT 要求存在 `conversationSummary`

#### Scenario: Summary 存在
- **WHEN** 会话中存在 `conversationSummary` 或可选后台摘要
- **THEN** Agent MUST NOT 直接将 `conversationSummary` 放入执行上下文
- **AND** 如确需长会话压缩，系统 MAY 将其转换为带 provenance 的 `ContextSnapshot`
- **AND** Agent MUST NOT 将 summary 或 ContextSnapshot 作为 artifact、exercise、训练参数或执行决策的事实源

#### Scenario: Summary 不存在
- **WHEN** 会话没有 `conversationSummary`
- **THEN** `/api/chat` MUST 仍能通过 recent messages 和工具完成正常 Agent 编排
- **AND** 系统 MUST NOT 因 summary 缺失而跳过工具查询或降级到旧 intent-first 主链

### Requirement: Agent 工具结果必须形成依赖图

系统 SHALL 为每个工具调用和工具结果登记稳定 id，并用 `AgentDependencyGraph` 连接读结果、候选集合、草稿、校验、Policy、确认和写入。

#### Scenario: 工具返回候选集合
- **WHEN** Agent 调用动作或 artifact 检索工具
- **THEN** 工具 MUST 返回 `candidateSetId` 或等价结构化结果 id
- **AND** 后续 Patch、draft 或保存工具 MUST 通过 id 引用该候选集合
- **AND** 系统 MUST NOT 接受模型自由文本声明“候选已查询”作为前置条件

#### Scenario: 工具返回校验结果
- **WHEN** Validator、Policy 或 Confirmation 工具执行完成
- **THEN** 工具 MUST 返回 `validationId`、`policyDecisionId` 或 `confirmationId`
- **AND** 写工具 MUST 校验这些 id 属于当前 run、当前 userId、当前目标资源和未过期状态

#### Scenario: 重放 Agent run
- **WHEN** 开发者或测试读取 trace/replay fixture
- **THEN** 系统 MUST 能按 dependency graph 关联最终回复、artifact 事件、写入结果和所使用工具结果
- **AND** 系统 MUST 能证明写入不是由旧 intent 字段、summary 或模型正文触发

### Requirement: Agent 工具必须由服务端受控执行

系统 SHALL 通过统一 `AgentToolRegistry` 注册 LLM 可调用工具，并在每次工具执行前完成 Schema、权限、候选集合、Policy、Validator 或 Persistence 边界校验。

#### Scenario: LLM 调用工具
- **WHEN** LLM 请求调用 Agent 工具
- **THEN** `toolName` MUST 属于服务端 registry
- **AND** `input` MUST 通过该工具的 Schema 校验
- **AND** 工具执行上下文 MUST 绑定当前 `userId`、`sessionId`、trace 和请求预算

#### Scenario: 工具不存在或参数非法
- **WHEN** LLM 请求未知工具、非法参数或越权资源
- **THEN** 服务端 MUST 拒绝执行
- **AND** Agent MUST 将该结果视为可诊断工具失败
- **AND** 系统 MUST NOT 把未知工具请求转发给任意服务端函数

#### Scenario: 写工具被调用
- **WHEN** LLM 请求保存 artifact、应用 Patch 或持久化训练变更
- **THEN** 写工具 MUST 校验前置读结果、候选集合、Validator、Policy 和 Confirmation 状态
- **AND** 写工具输入 MUST 引用已登记的 tool result id，不得只接受自然语言说明
- **AND** 写工具 MUST 创建安全 revision 或返回明确失败
- **AND** LLM MUST NOT 直接写数据库或执行任意 SQL

#### Scenario: 注册新的领域写工具
- **WHEN** 系统新增 `updateUserProfile`、`updateNotificationSettings`、`writeUserMemory` 或等价非训练 artifact 写工具
- **THEN** 该工具 MUST 绑定明确领域能力合同
- **AND** 该合同 MUST 声明可写资源、字段白名单、输入 Schema、权限上下文、确认策略、持久化服务、幂等 key、trace 摘要和 Response Writer 摘要
- **AND** 系统 MUST NOT 注册缺少领域服务、权限隔离、确认边界或持久化边界的任意写工具

#### Scenario: 新工具需要新的数据或用户流程边界
- **WHEN** 新 Agent tool 需要新增数据库字段、API 契约、权限模型、用户可见状态或用户流程
- **THEN** 系统 MUST 先通过对应 OpenSpec change 定义该领域能力
- **AND** Agent registry MUST 只在领域合同明确后接入该工具
- **AND** 系统 MUST NOT 把新增 tool 当成绕过 OpenSpec 和数据模型设计的插件入口

### Requirement: Agent 必须支持训练生成、Patch、重新生成和澄清

系统 SHALL 让 Agent 基于工具结果选择回答、澄清、生成、局部 Patch 或整套重新生成，而不是让服务端关键词规则选择执行策略。

#### Scenario: Agent 先提出 WorkoutEditPlan
- **WHEN** 用户请求调整已有训练内容
- **THEN** Agent MUST 在 Patch 或 Regenerate 前提出结构化 `WorkoutEditPlan`
- **AND** `WorkoutEditPlan` MUST 描述目标 artifact、保留项、变更项、影响范围、候选集合依赖和确认级别
- **AND** 服务端 MUST 校验该 edit plan 引用的 artifact payload 和 candidateSetId

#### Scenario: 局部修改已有 artifact
- **WHEN** LLM 读取目标 artifact payload 后判断用户只要求修改局部内容
- **THEN** Agent MUST 调用 Patch 相关工具提出结构化 Patch
- **AND** 服务端 MUST 校验 Patch target、scope、candidate set 和 artifact 可访问性

#### Scenario: 整套训练条件变化
- **WHEN** LLM 读取目标 artifact payload 后判断用户改变器械、场地、整体难度、目标或大幅时长
- **THEN** Agent MUST 调用重新生成或 draft 工具
- **AND** 新 draft MUST 沿用应保留的目标、时长、经验或上下文事实
- **AND** 新 draft MUST 使用当前用户覆盖后的条件

#### Scenario: 信息不足
- **WHEN** LLM 通过工具仍无法确定目标 artifact、目标动作、训练条件或用户偏好
- **THEN** Agent MUST 返回 `needs_clarification`
- **AND** 系统 MUST 输出用户可直接发送的 `assistantSuggestions`
- **AND** 系统 MUST NOT 猜测 artifactId、exerciseId 或训练变更范围

### Requirement: 最终回复必须只描述真实执行结果

系统 SHALL 通过 Response Writer 基于 `AgentExecutionResult` 生成用户可见回复。

#### Scenario: Artifact 已生成或修订
- **WHEN** `AgentExecutionResult` 表示已生成、已 patch 或已保存 revision
- **THEN** 回复 MUST 描述真实完成的训练结果
- **AND** 聊天流 MUST 返回对应 artifact、patch 或 revision 事件

#### Scenario: 非训练 artifact 的受控写操作已完成
- **WHEN** `AgentExecutionResult` 表示 `completed_operation`
- **THEN** 回复 MUST 只描述对应 `operationResultId` 已完成的真实写入结果
- **AND** 回复中的字段和值 MUST 来自已登记 tool result 的安全摘要
- **AND** 聊天流或 done metadata MUST 能表达该操作的类型、结果 id、是否需要后续确认和用户可见状态
- **AND** 系统 MUST NOT 为该操作伪造 artifact revision、patch result 或旧 resolved intent

#### Scenario: 未执行写操作
- **WHEN** `AgentExecutionResult` 表示需要澄清、工具失败、校验失败或 policy blocked
- **THEN** 回复 MUST 说明当前阻断原因或下一步
- **AND** 回复 MUST NOT 承诺训练卡片已经生成、修改或稍后展示

#### Scenario: 回复需要引用动作或训练事实
- **WHEN** 回复中出现具体动作、训练结构、器械、时长或 artifact 信息
- **THEN** 这些内容 MUST 来自本轮 tool result、已保存 artifact 或服务端校验结果
- **AND** 回复 MUST NOT 编造数据库不存在的 exerciseId 或未读取的 artifact 内容

#### Scenario: Response Writer 使用模型润色
- **WHEN** 系统使用 LLM 生成最终自然语言措辞
- **THEN** 模型输入 MUST 是 `AgentExecutionResult` 的只读投影
- **AND** 输出 MUST 经过事实引用校验，确保具体事实可映射到 usedToolResultIds、revisionId、validationId 或 policyDecisionId
- **AND** Response Writer MUST NOT 重新调用语义决策、候选搜索、Patch、生成或写入工具

### Requirement: Agent 模型调用必须使用新的 Prompt 与输出协议

系统 SHALL 将 `/api/chat` 生产主链的模型调用迁移为 Agent tool decision、Agent final result 和 Response Writer 三类协议。旧 intent-first prompt module 不得继续驱动执行决策。

#### Scenario: Agent tool decision 调用
- **WHEN** Agent loop 请求 LLM 决定下一步
- **THEN** 模型输入 MUST 包含 `ContextPackage` 摘要、registry 工具定义、已登记 tool results、dependency graph 和本轮预算
- **AND** 模型输出 MUST 只允许合法工具调用请求或合法终止结果
- **AND** 模型 MUST NOT 读取 `conversationSummary`、旧 resolved intent 或旧 `assistant_action` 作为执行事实

#### Scenario: Agent final result 调用
- **WHEN** Agent 准备结束本轮执行
- **THEN** 模型输出 MUST 通过 `AgentExecutionResult` Schema 校验
- **AND** 生成、Patch、阻断或失败结果 MUST 引用本轮已登记的 tool result、validation、policy、revision 或 blocking reason
- **AND** 通用受控写操作结果 MUST 使用 `completed_operation` 并引用 `operationResultId`、`usedToolResultIds` 和必要的 policy/confirmation id
- **AND** 系统 MUST NOT 将自由文本回答当作执行成功信号

#### Scenario: 旧 prompt module 不再驱动主链
- **WHEN** `/api/chat` 进入 Tool-first Agent 主链
- **THEN** 系统 MUST NOT 使用 `chat_intent_resolution`、`chat_final_response`、`conversation_summary_context` 或 `reference_resolution_boundary` 作为生产执行决策入口
- **AND** 如保留这些 module，MUST 仅用于兼容诊断、后台 summary 或已明确降级的非执行场景

#### Scenario: 模型输出解析失败
- **WHEN** Agent decision、final result 或 Response Writer 输出为空、无法解析、Schema 不合法、请求未知工具或请求非法多工具调用
- **THEN** 系统 MUST 进入可诊断失败、repair 或 blocked 路径
- **AND** trace MUST 记录失败 code、模型阶段、输入摘要和恢复结果

### Requirement: 旧兼容字段必须单向派生并具备退出条件

系统 SHALL 通过 `LegacyChatEventAdapter` 从 `AgentExecutionResult` 单向派生旧字段。旧 intent-first 字段 MUST NOT 参与 Agent 执行、工具选择、卡片生成、写入或测试核心验收。

#### Scenario: 前端仍需要旧事件
- **WHEN** 前端迁移期间仍消费 `assistant_action`、resolved intent 或 suggestedReplies 旧事件
- **THEN** 这些事件 MUST 由 `AgentExecutionResult` 和 tool results 派生
- **AND** 系统 MUST NOT 保留旧 resolved intent 独立触发卡片的路径

#### Scenario: 兼容期结束
- **WHEN** 前端、黑盒报告和开发 trace 已支持 `AgentExecutionResult`
- **THEN** 旧兼容事件 MUST 从生产主流事件中删除或降级为调试信息
- **AND** 自动化测试 MUST 断言删除旧事件不会影响 artifact、patch、suggestion 或 done metadata
