## ADDED Requirements

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

#### Scenario: 旧兼容事件仍存在
- **WHEN** 系统仍需要解析历史 `assistant_action`、`intent_resolved` 或 trigger JSON
- **THEN** 解析逻辑 MUST 位于离线迁移、历史展示兼容或测试 fixture 中
- **AND** 生产聊天流 MUST NOT 输出这些事件作为新运行结果
- **AND** 前端 MUST NOT 依赖这些事件触发训练卡片

#### Scenario: 用户发送短指令
- **WHEN** 用户发送“换一个”“不用哑铃”“简单点”“改成在家练”或等价短指令
- **THEN** Agent MUST 通过工具读取真实 recent messages、artifact payload、动作候选和用户记忆后决定执行结果
- **AND** 服务端 MUST NOT 通过旧关键词规则或 resolved intent 归一化预先改写高层语义

## REMOVED Requirements

### Requirement: 聊天主链路必须产出唯一 resolved intent

**Reason**: Tool-first `AgentOrchestrator` 已经成为 `/api/chat` 生产主链。继续要求唯一 resolved intent 会保留第二套执行合同。

**Migration**: 使用 `AgentExecutionResult`、Agent tool results、artifact / patch / suggestion 事件和 done metadata 表达本轮执行结果。

### Requirement: resolved intent 必须提供共享的结构化 action contract

**Reason**: 共享 action contract 属于旧 intent-first 架构，已经被 Agent tool schema 和 `AgentExecutionResult` 替代。

**Migration**: 训练生成、Patch、澄清和普通回答通过 Agent tool registry、dependency graph 和 final result schema 表达。

### Requirement: resolved intent 必须区分澄清回复和生成后调整建议

**Reason**: 澄清、生成后建议和阻断原因现在由 `AgentExecutionResult.status`、`assistantSuggestions` 和 tool failure / policy result 表达。

**Migration**: 使用 `needs_clarification`、`blocked`、`failed`、`generated`、`patched` 等 Agent result 状态区分用户可见结果。

### Requirement: 服务端必须校验 resolved intent 内部一致性

**Reason**: resolved intent 不再是执行合同，校验它的内部一致性没有生产意义。

**Migration**: 校验 Agent tool input、tool result dependency、candidate set、Validator、Policy、Confirmation 和 `AgentExecutionResult` schema。

### Requirement: 冲突 resolved intent 必须经过一次 repair 或降级为澄清

**Reason**: resolved intent repair 属于旧模型调用协议，会让旧意图解析继续参与生产执行。

**Migration**: Agent decision、Agent final result 或 Response Writer 解析失败时，走 Agent repair、blocked、failed 或 clarification 路径。

### Requirement: 生成型 artifact 必须由服务端聊天编排闭环生成

**Reason**: 该要求绑定 resolved intent 和旧 chat orchestrator。生产闭环现在应由 Agent 工具调用、校验和持久化形成。

**Migration**: 生成型 artifact 必须由 Agent 调用受控生成/校验/保存工具完成，并由 `AgentExecutionResult` 投影给前端。

### Requirement: 用户回复必须基于 resolved intent 和 artifact 结果生成

**Reason**: 用户回复不再消费 resolved intent。

**Migration**: Response Writer 只消费 `AgentExecutionResult`、已登记 tool results、artifact summary、validation / policy / revision 结果和 suggestions。

### Requirement: 前端不得从自然语言回复正文二次提取卡片触发

**Reason**: 该要求中的约束仍正确，但它属于旧 resolved action 迁移期描述。

**Migration**: 前端只能消费 `agent_execution_result`、artifact / patch / suggestion 事件和 done metadata；不得从正文或旧 `assistant_action` 触发生成。

### Requirement: 聊天编排必须在适用场景进入只读 tool loop

**Reason**: 独立只读 tool loop 已被统一 Agent tool loop 替代。

**Migration**: 读工具迁入 `AgentToolRegistry`，由 Agent 按工具 schema、权限、预算和 dependency graph 调用。

### Requirement: 只读 tool loop 不得绕过 resolved intent 门控

**Reason**: resolved intent 门控和独立只读 tool loop 都不再是生产主链能力。

**Migration**: 所有读写工具都通过 Agent dependency graph 和服务端硬边界约束，不存在只读 loop 绕过旧 intent gate 的路径。

### Requirement: 聊天回复必须显式消费只读工具上下文

**Reason**: `tool context bundle` 是旧只读 loop 产物。

**Migration**: 最终回复必须消费 Agent tool results 和 `AgentExecutionResult` 的只读投影。

### Requirement: 服务端不得语义重写 LLM 的高层意图

**Reason**: 该原则仍正确，但不应继续以 LLM resolved intent 为中心表达。

**Migration**: 服务端不得在 Agent 前用关键词、正则、短句模板或历史摘要推断改写用户高层语义；服务端只校验工具和执行硬边界。

### Requirement: 服务端契约归一化只能处理确定性边界

**Reason**: 旧契约归一化绑定 resolved intent 字段。

**Migration**: 确定性归一化只允许发生在 Agent tool input schema、tool output schema、validator input、policy input 和 response projection 边界。

### Requirement: 局部替换不得退化为整套重新生成

**Reason**: 该行为要求仍重要，但旧表述依赖 resolved intent、ReferenceResolver 和旧 patch 触发。

**Migration**: Agent 必须先读取 artifact payload 并产出 `WorkoutEditPlan` 或等价 tool result，再选择 Patch、Regenerate 或 Clarify；服务端不得用关键词选择策略。

### Requirement: `/api/chat` 必须从服务端会话恢复结构化历史事实

**Reason**: 该要求绑定旧 action gate 和内部 conversation context。

**Migration**: `AgentContextBuilder` 从服务端会话恢复真实 recent messages、recent artifacts、用户记忆和 pending confirmation，并通过工具读取完整结构化事实。

### Requirement: 长期计划短指令必须使用 hydrated plan 上下文

**Reason**: 该要求以旧 plan intent 触发为中心。

**Migration**: 长期计划短指令由 Agent 基于 recent artifact、plan payload、用户记忆和 tool results 决定生成、Patch、Regenerate 或澄清。
