## ADDED Requirements

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
