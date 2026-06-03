## REMOVED Requirements

### Requirement: /api/chat 必须使用 Tool-first AgentOrchestrator 作为主链

**Reason**: `/api/chat` 不再承载运行时 AI/Agent 执行能力。旧 Tool-first `AgentOrchestrator` 与旧 tools、旧 Response Writer、旧 trace 和训练业务恢复逻辑深度绑定，必须整体删除。

**Migration**: 删除旧主链和 AI 执行入口。不提供兼容主链、不回退旧 intent-first、不伪造 Agent 结果。未来如需重新引入 AI，必须另起 change 从空白运行时边界设计。

### Requirement: AgentContextBuilder 必须成为 Agent 唯一上下文入口

**Reason**: 旧 `AgentContextBuilder` 属于旧 AI/Agent 运行时输入包装层，绑定旧 runtime、旧 tool result、旧 artifact summary 和旧 trace 投影。

**Migration**: 删除旧 builder。页面和非 AI 服务不得依赖 `ContextPackage` 作为运行时合同。

### Requirement: Agent 主链不得依赖 conversationSummary

**Reason**: 该要求绑定旧 Agent 主链的上下文策略；删除运行时 AI 后，不再需要维护 Agent 对 summary 的依赖边界。

**Migration**: 删除旧 Agent summary 合同。若保留普通会话摘要数据，也不得作为 AI 执行输入或旧 Agent 兼容层。

### Requirement: Agent 工具结果必须形成依赖图

**Reason**: 旧 dependency graph 绑定旧 `AgentExecutionState`、旧 tool result id、旧 runtime 引用校验和旧 replay fixture。

**Migration**: 删除旧 dependency graph 合同和相关运行时字段。不得为页面、trace 或测试伪造 dependency graph。

### Requirement: Agent 工具必须由服务端受控执行

**Reason**: 该边界绑定当前 `AgentToolRegistry`、旧工具执行器和旧 tool calling 流程。运行时 AI/Agent 逻辑删除后，旧服务端工具执行合同不再存在。

**Migration**: 删除旧 registry、旧 executor 和旧 tool calling 能力。不保留只读 loop、写工具、tool manifest 或兼容执行入口。

### Requirement: Agent 必须支持训练生成、Patch、重新生成和澄清

**Reason**: 当前要求把训练生成、Patch、重新生成和澄清绑定到旧 Agent final result、旧 tool chain、旧 artifact 投影和旧 Response Writer。

**Migration**: 删除旧 AI 训练生成、Patch、重新生成和澄清运行时能力。页面如保留，不得通过旧 Agent 事件触发这些业务。

### Requirement: 最终回复必须只描述真实执行结果

**Reason**: 该原则绑定旧 `AgentExecutionResult` 和旧 Response Writer 投影。删除运行时 AI 后，不再存在由模型生成最终回复的执行合同。

**Migration**: 删除旧 Response Writer 和最终回复投影。不得返回伪造的旧执行结果来满足旧 UI 或测试。

### Requirement: Agent 模型调用必须使用新的 Prompt 与输出协议

**Reason**: 当前 Prompt 与输出协议是旧 Agent runtime 的合同，包含旧 tool name、旧 final result、旧修复循环和旧业务收口。

**Migration**: 删除旧 Prompt、模型调用协议和输出 schema。生产代码不得保留旧 Agent decision provider 或旧 final result parser。

### Requirement: 旧兼容字段必须单向派生并具备退出条件

**Reason**: 旧兼容字段属于迁移期产物。当前目标是删除运行时 AI/Agent 系统，不再维护兼容派生或退出条件。

**Migration**: 删除旧兼容派生。不得保留 legacy adapter、旧 stream event 映射或旧 done metadata。

### Requirement: Agent 不得用服务端自然语言规则改写非写入对话语义

**Reason**: 该 AI 语义边界是项目原则，但当前 requirement 绑定旧 Agent 主链。删除运行时 AI 后，此处不再需要以旧 Agent requirement 表达。

**Migration**: 删除旧 Agent 语义边界要求。未来如重新引入 AI，需要在新的 change 中重新定义，不继承旧 runtime。

### Requirement: Agent artifact 查看必须是只读工具链

**Reason**: 当前 artifact 查看要求绑定旧只读 tool、旧 tool result id、旧 response projection 和旧 Agent stream。

**Migration**: 删除旧 artifact 查看工具链。页面若保留 artifact 展示，应通过非 AI 的现有数据读取能力实现，不通过旧 Agent tool。

### Requirement: 写工具 message 绑定必须来自服务端执行上下文

**Reason**: 旧写工具 message 绑定属于旧 Agent tool 外壳的安全补丁，依赖旧写入 tool、旧 confirmation 和旧 persistence 投影。

**Migration**: 删除旧写工具外壳和 message 绑定合同。不保留旧 action hash 或写工具兼容入口。

### Requirement: Agent 终止结果必须使用资源角色校验

**Reason**: 旧资源角色校验绑定旧 final result、旧 resource id、旧 runtime 恢复策略和旧 trace projection。

**Migration**: 删除旧终止结果和资源角色运行时校验。不得保留 consumable/diagnostic 字段作为当前运行时合同。

### Requirement: Agent 必须把 askClarification 作为澄清终止路径

**Reason**: 当前澄清终止路径绑定旧 `askClarification` tool、旧 `AgentExecutionResult` union 和旧 Response Writer。

**Migration**: 删除旧澄清 tool 和旧 `needs_clarification` 终止合同。页面不得伪造旧澄清事件。

### Requirement: Agent 执行型生成链不得退化为普通 answered

**Reason**: 当前要求用于修补旧 final result 收口问题，绑定旧 `generated`、`patched` 和 `answered` 终止类型。

**Migration**: 删除旧终止类型合同和相关 repair/fallback 逻辑。当前运行时不保留 AI 执行型生成链。
