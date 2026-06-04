# chat-context-summarization Specification

## Purpose
TBD - created by archiving change summarize-ai-chat-context. Update Purpose after archive.
## Requirements
### Requirement: 上下文总结更新由服务端负责
系统 SHALL 在服务端维护和更新聊天上下文总结，前端不得成为总结策略的事实来源。

#### Scenario: 助手回复完成
- **WHEN** `/api/chat` 完成本轮助手回复
- **THEN** 服务端 MUST 使用旧 summary、本轮用户消息、助手回复和服务端内部动作摘要生成新的 `conversationSummary`
- **AND** 系统 MUST 将新的 `conversationSummary` 保存到会话或消息 metadata 中，供下一轮请求使用

#### Scenario: Summary 更新失败
- **WHEN** LLM summary 更新失败、超时或不可用
- **THEN** 系统 MUST 使用确定性兜底方式生成受长度限制的 summary
- **AND** 聊天回复 MUST NOT 因 summary 更新失败而丢失本轮用户可见回复
- **AND** AI Trace MUST 记录 summary 更新失败原因

#### Scenario: Summary 内容边界
- **WHEN** 系统生成或更新 `conversationSummary`
- **THEN** summary MUST 优先保留用户训练目标、经验、器械或场地、单次时长、频率、伤痛限制、偏好、避免项、最近意图和未完成问题
- **AND** summary MUST NOT 把服务端默认值描述成用户明确提供的信息

### Requirement: conversationSummary 不得进入 Agent 执行事实源
系统 SHALL 保留 `conversationSummary` 作为后台摘要、标题、历史迁移或调试材料，但生产 Agent 执行 MUST NOT 依赖它恢复训练事实、引用对象、动作候选、训练参数或用户高层语义。

#### Scenario: Agent 构造上下文
- **WHEN** `/api/chat` 构造 `ContextPackage`
- **THEN** `ContextPackage` MUST 使用真实 recent messages、recent artifact 摘要、用户记忆、pending confirmation 和 provenance
- **AND** `conversationSummary` MUST NOT 作为 Agent 执行事实源进入工具决策

#### Scenario: 需要完整训练事实
- **WHEN** Agent 需要 artifact payload、exerciseId、Patch target、训练结构或保存 payload
- **THEN** Agent MUST 通过工具读取结构化事实
- **AND** 系统 MUST NOT 从 `conversationSummary` 反向构造可写 payload

### Requirement: conversationSummary 必须从聊天主链降级为可选后台摘要

系统 SHALL 从 `/api/chat` Tool-first Agent 主链中移除 `conversationSummary` 的必需依赖。`conversationSummary` MAY 作为后台摘要、会话标题或调试展示存在，但 MUST NOT 直接进入 Agent 执行上下文、作为模型唯一历史上下文或执行事实源。

#### Scenario: Agent 主链不依赖 summary
- **WHEN** `/api/chat` 构造 Tool-first Agent 输入
- **THEN** 系统 MUST 使用当前最新用户消息、真实 recent messages、recent artifacts、用户记忆和工具结果构造上下文
- **AND** 系统 MUST NOT 要求存在 `conversationSummary`
- **AND** 系统 MUST NOT 因 summary 缺失而降级、拒绝或跳过必要工具查询

#### Scenario: Summary 可选存在
- **WHEN** 系统仍生成或读取 `conversationSummary`
- **THEN** summary MUST 只作为后台材料、标题材料或调试材料
- **AND** Agent MUST NOT 直接读取 summary 作为执行上下文
- **AND** Agent MUST NOT 基于 summary 直接决定 artifactId、exerciseId、Patch target、器械条件、训练参数或保存 payload

#### Scenario: 长会话需要压缩
- **WHEN** recent messages 超出 Agent 上下文预算
- **THEN** 系统 MAY 生成 `ContextSnapshot`
- **AND** `ContextSnapshot` MUST 记录来源消息范围、生成时间、可信级别和禁止作为事实源的边界
- **AND** Agent 需要结构化事实时 MUST 继续通过工具读取 artifact payload、exercise 或用户记忆

#### Scenario: Summary 更新
- **WHEN** 系统选择保留 summary 更新能力
- **THEN** summary 更新 MUST 是非阻断后台任务或调试辅助步骤
- **AND** summary 更新失败 MUST NOT 影响 `/api/chat` 本轮 Agent 执行、工具查询、artifact 生成或用户回复
- **AND** summary 更新输入 SHOULD 消费 `AgentExecutionResult` 和最终回复摘要，而不是旧 intent-first 分支

#### Scenario: 不再使用 summary-only 历史上下文
- **WHEN** 下游 LLM 调用需要历史上下文
- **THEN** 系统 MUST 提供 `ContextPackage`、真实 recent messages、tool result 或 artifact payload 摘要
- **AND** 系统 MUST NOT 使用 `conversationSummary + latestUserMessage` 作为唯一历史上下文协议

#### Scenario: 下游 prompt 迁移
- **WHEN** 动作推荐、训练草稿生成、训练草稿修复或 summary 更新等下游 LLM 调用需要上下文
- **THEN** 输入 MUST 来自 Agent 已确定的结构化 intent/edit plan、candidateSetId、ContextPackage 摘要、tool result、`AgentExecutionResult` 或最终回复摘要
- **AND** prompt MUST NOT 声明模型只能依赖 `conversationSummary + latestUserMessage` 理解历史
- **AND** 下游调用 MUST NOT 从 summary 反推 artifactId、exerciseId、Patch target、器械条件、训练参数或保存 payload

### Requirement: 上下文选择策略必须可测试

系统 SHALL 将 Agent 可见上下文选择、截断和来源记录为稳定合同，避免后续为了 token 成本重新退回 summary-only 或服务端规则补丁。

#### Scenario: 构造上下文包
- **WHEN** `AgentContextBuilder` 构造 `ContextPackage`
- **THEN** 测试 MUST 能断言包含哪些 recent messages、artifact 摘要、用户记忆和 pending confirmation
- **AND** 测试 MUST 能断言哪些内容被截断、为什么截断、截断后是否仍允许工具读取完整事实

#### Scenario: 缺少 summary
- **WHEN** conversationSummary 为空、缺失、过期或更新失败
- **THEN** `/api/chat` MUST 继续通过 `ContextPackage` 和 Agent tools 执行
- **AND** 系统 MUST NOT fallback 到旧 intent-first 主链或服务端关键词补丁

#### Scenario: 模型可见上下文摘要
- **WHEN** 系统记录 token budget、prompt module 或 trace 中的模型可见上下文
- **THEN** 摘要 MUST 记录 recent messages、recent artifacts、用户记忆、ContextSnapshot、tool result、截断策略和限制原因
- **AND** 摘要 MUST NOT 再把 conversationSummary 描述为历史上下文唯一来源

### Requirement: 上下文事实摘要不得从 raw text 提取高层操作语义

系统 SHALL 将服务端确定性上下文事实摘要限制在可证明、低歧义、不会改写用户语义的事实范围内。训练目标、查看目标、保存意图、取消意图、确认含义、调整方向等高层语义 MUST 由 LLM 结构化输出、已登记 tool result、artifact index、用户记忆或其他已校验结构化事实提供；服务端 MUST NOT 通过 raw user message 的关键词、正则、短句模板或同义词表提取这些高层语义事实。

#### Scenario: 操作性请求不进入 knownFacts.goal
- **WHEN** 用户消息表达查看、保存、选择、确认、否定、闲聊或其他操作性对话行为
- **THEN** 服务端确定性上下文构建 MUST NOT 将该原始文本写入 `knownFacts.goal`
- **AND** 系统 MUST 仍保留该消息作为 recent message 供 LLM 结合上下文理解
- **AND** 系统 MUST NOT 基于该原始文本改写模型后续输出的 intent、action 或 toolName

#### Scenario: 结构化训练目标可以进入上下文
- **WHEN** LLM 结构化输出、已校验 tool result、artifact index 或用户记忆提供了训练目标事实
- **THEN** 系统 MUST 可以把该目标作为 `knownFacts.goal`、artifact summary 或 memory fact 提供给后续上下文
- **AND** 该事实 MUST 记录来源或能够通过 trace / provenance 关联到结构化来源

#### Scenario: 低歧义事实仍可确定性提取
- **WHEN** 用户消息包含明确数值时长、已枚举器械、周频或其他低歧义事实
- **THEN** 服务端 MAY 继续提取这些确定性事实
- **AND** 服务端 MUST NOT 因这些事实存在而推断用户高层意图属于生成、查看、保存、确认或取消

### Requirement: 上下文摘要污染不得触发执行链

系统 SHALL 确保 `conversationContext`、`knownFacts` 或后台 summary 中的历史材料不会单独触发训练生成、训练修改、artifact 保存或用户可见卡片投影。执行链必须来自最新用户消息的 LLM 结构化决策和当前 run 工具结果。

#### Scenario: 历史 goal 与最新消息冲突
- **WHEN** 历史上下文包含训练目标事实
- **AND** 最新用户消息被 LLM 结构化理解为普通回答、澄清、查看或无法执行请求
- **THEN** 系统 MUST 按最新结构化 Agent result 执行
- **AND** 系统 MUST NOT 仅因历史 `knownFacts.goal` 存在而启动 routine generation、Patch 或 save chain

#### Scenario: 后台 summary 包含保存描述
- **WHEN** `conversationSummary` 或后台摘要包含“保存”“查看”“刚才生成”等自然语言描述
- **THEN** Agent MUST NOT 将 summary 作为执行事实源
- **AND** 如需 artifact payload 或目标 artifact，Agent MUST 通过受控 artifact 工具读取
- **AND** 系统 MUST NOT 从 summary 反向构造 artifactId、draftId、validationId、policyDecisionId 或保存 payload

### Requirement: Trace 必须区分摘要事实和模型语义决策

系统 SHALL 在 trace 中区分服务端上下文摘要事实、模型结构化决策和工具执行证据，便于排查短回复、查看请求或保存请求是否被错误带入执行链。

#### Scenario: 记录 knownFacts 来源摘要
- **WHEN** `/api/chat` 构造 `ContextPackage` 或服务端 hydration metadata
- **THEN** trace MUST 能展示 `knownFacts` 中训练目标、时长、器械等摘要字段
- **AND** trace MUST 能区分这些字段来自确定性低歧义提取、结构化 LLM intent、artifact summary、tool result 或用户记忆

#### Scenario: 排查短回复执行失败
- **WHEN** 用户短回复后系统返回失败、澄清或普通回答
- **THEN** trace MUST 能展示本轮模型 final result status、是否调用训练生成/保存工具、以及是否存在上下文摘要事实
- **AND** trace MUST NOT 把上下文摘要事实描述成服务端已经判断出的用户语义意图

