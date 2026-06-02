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

