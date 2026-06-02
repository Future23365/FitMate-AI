## ADDED Requirements

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

## REMOVED Requirements

### Requirement: 聊天模型输入使用自然语言上下文总结

**Reason**: summary-only 模型输入协议已被 `ContextPackage` 和 Agent tool results 替代。

**Migration**: Agent 输入使用最新用户消息、真实 recent messages、recent artifact 摘要、用户记忆和按需工具读取结果。

### Requirement: 结构化上下文仅作为服务端内部校验输入

**Reason**: Agent 架构要求模型可以通过受控工具读取结构化事实，旧“模型只看 summary”边界不再成立。

**Migration**: 结构化事实通过 Agent tool result 摘要进入模型上下文，并保留权限、摘要和 provenance。

### Requirement: AI Trace 展示 summary 上下文边界

**Reason**: Trace 不应继续把 summary-only 作为主链边界。

**Migration**: Trace 展示 `ContextPackage`、tool results、截断策略、provenance 和 summary 后台更新状态。

### Requirement: 短指令必须沿用最近训练事实

**Reason**: 该要求依赖 summary 或旧服务端内部上下文触发训练 intent。

**Migration**: 短指令由 Agent 读取 recent artifacts、payload、动作库和用户记忆后生成 `AgentExecutionResult`。

### Requirement: Summary 必须参与预算化上下文选择

**Reason**: `conversationSummary` 不再是历史上下文唯一模型可见来源。

**Migration**: Token budget 约束 `ContextPackage` 摘要、tool result 摘要、Agent step 数和 Response Writer 输入；不得以预算为由跳过必要工具读取。
