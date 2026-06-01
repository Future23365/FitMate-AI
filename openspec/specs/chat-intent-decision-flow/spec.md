# chat-intent-decision-flow Specification

## Purpose
TBD - created by archiving change unify-chat-intent-decision-flow. Update Purpose after archive.
## Requirements
### Requirement: 旧聊天意图架构必须从生产主链移除
系统 SHALL 从生产 `/api/chat` 主链移除旧 intent-first 架构。`ResolvedChatIntent`、`ChatIntent`、`workoutIntent`、`action.shouldTrigger`、`responseMode`、`assistant_action` 和 `intent_resolved` MUST NOT 作为生产执行合同、卡片触发事实源、Patch 决策、计划生成输入或最终回复依据。

#### Scenario: 聊天请求进入生产主链
- **WHEN** 用户向 `/api/chat` 发送消息
- **THEN** 系统 MUST 进入 Tool-first `AgentOrchestrator`
- **AND** 系统 MUST 以 `AgentExecutionResult` 作为本轮唯一生产执行合同
- **AND** 系统 MUST NOT 先运行旧 intent resolution、resolved intent repair、旧 action gate 或旧只读 tool loop 触发矩阵

#### Scenario: 旧 intent 字段仍存在于代码库
- **WHEN** 代码库中仍保留 `ResolvedChatIntent`、`ChatIntent`、`workoutIntent` 或旧 action 字段类型
- **THEN** 这些类型 MUST 只能用于历史数据迁移、离线报告解析或测试夹具
- **AND** 生产 `/api/chat` MUST NOT 导入这些类型来决定工具选择、生成、Patch、保存或回复
- **AND** allowlist 外的旧类型、旧 helper、旧 prompt module 和旧 adapter MUST 被删除

#### Scenario: 旧兼容事件仍存在
- **WHEN** 系统仍需要解析历史 `assistant_action`、`intent_resolved` 或 trigger JSON
- **THEN** 解析逻辑 MUST 位于离线迁移、历史展示兼容或测试 fixture 中
- **AND** 生产聊天流 MUST NOT 输出这些事件作为新运行结果
- **AND** 前端 MUST NOT 依赖这些事件触发训练卡片

#### Scenario: 生产流输出用户可见结果
- **WHEN** 新运行需要向前端表达卡片、Patch、建议、澄清、阻断、失败或保存状态
- **THEN** 系统 MUST 通过 `agent_execution_result`、artifact / patch / suggestion 事件、tool evidence metadata 或 done metadata 表达
- **AND** 系统 MUST NOT 输出 `assistant_action`、`intent_resolved`、旧 trigger JSON 或可作为执行事实源的 `workoutIntent`

#### Scenario: 用户发送短指令
- **WHEN** 用户发送“换一个”“不用哑铃”“简单点”“改成在家练”或等价短指令
- **THEN** Agent MUST 通过工具读取真实 recent messages、artifact payload、动作候选和用户记忆后决定执行结果
- **AND** 服务端 MUST NOT 通过旧关键词规则或 resolved intent 归一化预先改写高层语义

#### Scenario: Agent 主链需要处理失败
- **WHEN** Agent decision、工具调用、候选检索、引用读取、validation、policy、persistence 或 Response Writer 失败
- **THEN** 系统 MUST 使用 Agent repair、tool retry、`needs_clarification`、`blocked`、`failed`、validation / policy failure handling 或用户确认表达失败处理结果
- **AND** 系统 MUST NOT 调用旧 intent resolution、resolved intent repair、旧 action gate、旧只读 tool loop、旧 trigger parser 或 summary-only payload reconstruction

