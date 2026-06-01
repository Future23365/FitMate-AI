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

