## ADDED Requirements

### Requirement: conversationSummary 必须从聊天主链降级为可选后台摘要

系统 SHALL 从 `/api/chat` Tool-first Agent 主链中移除 `conversationSummary` 的必需依赖。`conversationSummary` MAY 作为后台摘要、会话标题、调试展示或长会话辅助阅读材料存在，但 MUST NOT 作为模型唯一历史上下文或执行事实源。

#### Scenario: Agent 主链不依赖 summary
- **WHEN** `/api/chat` 构造 Tool-first Agent 输入
- **THEN** 系统 MUST 使用当前最新用户消息、真实 recent messages、recent artifacts、用户记忆和工具结果构造上下文
- **AND** 系统 MUST NOT 要求存在 `conversationSummary`
- **AND** 系统 MUST NOT 因 summary 缺失而降级、拒绝或跳过必要工具查询

#### Scenario: Summary 可选存在
- **WHEN** 系统仍生成或读取 `conversationSummary`
- **THEN** summary MUST 只作为可选辅助材料
- **AND** Agent MUST NOT 基于 summary 直接决定 artifactId、exerciseId、Patch target、器械条件、训练参数或保存 payload

#### Scenario: Summary 更新
- **WHEN** 系统选择保留 summary 更新能力
- **THEN** summary 更新 MUST 是非阻断后台任务或调试辅助步骤
- **AND** summary 更新失败 MUST NOT 影响 `/api/chat` 本轮 Agent 执行、工具查询、artifact 生成或用户回复
- **AND** summary 更新输入 SHOULD 消费 `AgentExecutionResult` 和最终回复摘要，而不是旧 intent-first 分支

#### Scenario: 不再使用 summary-only 历史上下文
- **WHEN** 下游 LLM 调用需要历史上下文
- **THEN** 系统 MUST 提供真实 recent messages、tool result 或 artifact payload 摘要
- **AND** 系统 MUST NOT 使用 `conversationSummary + latestUserMessage` 作为唯一历史上下文协议
