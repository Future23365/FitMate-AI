## ADDED Requirements

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
