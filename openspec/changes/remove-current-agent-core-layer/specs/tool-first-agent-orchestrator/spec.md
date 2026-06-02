## REMOVED Requirements

### Requirement: `/api/chat` 必须使用 Tool-first AgentOrchestrator 作为主链

**Reason**: 当前 Tool-first `AgentOrchestrator` 已经与旧 Agent tools、旧 response writer 和训练业务恢复逻辑深度绑定，不再作为后续通用 Agent core 的基础。

**Migration**: 删除旧主链；后续新 core 必须按新的通用编排器和单一职责 tool 边界重新接入 `/api/chat`。

### Requirement: AgentContextBuilder 必须成为 Agent 唯一上下文入口

**Reason**: 旧 `AgentContextBuilder` 属于当前 Agent core 的上下文包装层，绑定旧 runtime 输入和旧 tool result 投影。

**Migration**: 删除旧 builder；后续新 core 可复用 chat hydration 事实，但必须重新定义 `ContextPackage` 输入合同。

### Requirement: Agent 主链不得依赖 conversationSummary

**Reason**: 该要求本身方向正确，但当前表述绑定旧 Agent 主链，删除旧 core 后不应继续以旧 runtime 为锚点表达。

**Migration**: 后续新 core 继续保持 `conversationSummary` 只作背景材料的原则，并重新写入新 core 规格。

### Requirement: Agent 工具结果必须形成依赖图

**Reason**: 旧 dependency graph 绑定旧 `AgentExecutionState`、旧 tool result id 和旧 runtime 引用校验。

**Migration**: 删除旧 dependency graph 合同；后续新 core 重新定义 tool result provenance、resource id 和 replay fixture。

### Requirement: Agent 工具必须由服务端受控执行

**Reason**: 该边界正确，但旧要求绑定当前 `AgentToolRegistry` 和旧工具执行器。

**Migration**: 删除旧 registry；后续新 core 重新定义服务端 tool executor、权限、schema 和 policy guard。

### Requirement: Agent 必须支持训练生成、Patch、重新生成和澄清

**Reason**: 当前要求把训练生成、Patch、重新生成和澄清绑定到旧 Agent final result 与旧 tool chain。

**Migration**: 后续新 core 重新定义这些业务能力；本 change 只删除旧核心层，不承诺继续由旧工具支撑。

### Requirement: 最终回复必须只描述真实执行结果

**Reason**: 该原则正确，但旧 requirement 绑定旧 `AgentExecutionResult` 和旧 Response Writer 投影。

**Migration**: 后续新 Response Adapter 重新定义“真实执行结果”的输入、校验和投影边界。

### Requirement: Agent 模型调用必须使用新的 Prompt 与输出协议

**Reason**: 当前 prompt 与输出协议是旧 Agent runtime 的合同，已经被旧 tool name、旧 final result 和旧业务收口污染。

**Migration**: 删除旧 prompt/output 协议；后续新 core 重新定义 Planner 输出 `AgentAction` 和终止结果 schema。

### Requirement: 旧兼容字段必须单向派生并具备退出条件

**Reason**: 旧兼容字段属于旧迁移期产物；本 change 的目标是删除旧核心层，不继续维护兼容派生。

**Migration**: 删除旧兼容派生；后续新 core 若需要前端过渡字段，必须在新 change 中重新定义退出条件。

### Requirement: Agent 不得用服务端自然语言规则改写非写入对话语义

**Reason**: 该 AI 语义边界仍是项目原则，但旧 requirement 绑定旧 Agent 主链。

**Migration**: 将该原则保留在项目 AI 规则和后续新 core 规格中；当前旧 core 删除后不再以旧 Agent requirement 表达。

### Requirement: Agent artifact 查看必须是只读工具链

**Reason**: 当前 artifact 查看要求绑定旧只读 tool、旧 tool result id 和旧 response projection。

**Migration**: 删除旧 artifact 查看工具链；后续新 core 重新定义读取 artifact 的单一职责 tool。

### Requirement: 写工具 message 绑定必须来自服务端执行上下文

**Reason**: 旧写工具 message 绑定属于当前 Agent tool 外壳的安全补丁。

**Migration**: 后续新写工具必须重新定义服务端上下文、confirmation action hash 和持久化合同。

### Requirement: Agent 终止结果必须使用资源角色校验

**Reason**: 旧资源角色校验绑定旧 final result、旧 resource id 和旧 runtime 恢复策略。

**Migration**: 保留 consumable/diagnostic 经验；后续新 resource contract 重新定义资源角色和校验方式。

### Requirement: Agent 必须把 askClarification 作为澄清终止路径

**Reason**: 当前澄清终止路径绑定旧 `AgentExecutionResult` union 和旧 response writer。

**Migration**: 后续新 core 重新定义 clarification action 和 response adapter 投影。

### Requirement: Agent 执行型生成链不得退化为普通 answered

**Reason**: 当前要求用于修补旧 final result 收口问题，绑定旧 `generated`、`patched` 和 `answered` 终止类型。

**Migration**: 后续新 core 通过新 action/result schema 防止执行型链路退化；本 change 删除旧终止类型合同。
