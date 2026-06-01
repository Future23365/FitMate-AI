## ADDED Requirements

### Requirement: 旧只读 tool loop 必须迁入统一 Agent 工具体系
系统 SHALL 删除独立的只读-only LLM tool loop 生产能力。原只读工具的 Schema、权限、摘要、预算和 trace 边界 MUST 迁入统一 `AgentToolRegistry`，并由 Tool-first `AgentOrchestrator` 调用。

#### Scenario: Agent 需要读取 artifact 或动作数据
- **WHEN** Agent 需要搜索 artifact、读取 artifact payload、搜索动作或读取动作详情
- **THEN** Agent MUST 通过统一 `AgentToolRegistry` 调用对应读工具
- **AND** 工具执行 MUST 绑定当前 `userId`、`sessionId`、trace、预算和权限上下文
- **AND** 系统 MUST NOT 进入独立 `runReadonlyToolLoop`

#### Scenario: 旧 feature flag 存在
- **WHEN** 环境变量、配置或代码中仍存在 `ENABLE_READONLY_LLM_TOOLS`
- **THEN** 该开关 MUST NOT 控制生产 `/api/chat` 是否可以读取工具上下文
- **AND** 生产读工具可用性 MUST 由 Agent registry、工具权限和请求预算决定

#### Scenario: 旧只读工具测试迁移
- **WHEN** 自动化测试覆盖读工具
- **THEN** 测试 MUST 断言工具在 Agent registry 中注册并经过 Schema、权限和摘要边界
- **AND** 测试 MUST NOT 继续断言独立只读 loop 的触发矩阵、stop reason 或 fallback 到旧固定编排路径

## REMOVED Requirements

### Requirement: 系统必须提供只读 LLM Tool Registry

**Reason**: 独立只读 registry 已被统一 `AgentToolRegistry` 替代。

**Migration**: 将 `searchArtifacts`、`getArtifactPayload`、`getExerciseById`、`searchExercises` 等读工具注册到 Agent registry。

### Requirement: 系统必须支持受控 JSON tool decision 协议

**Reason**: 只读-only JSON decision 协议是旧 tool loop 的运行时合同。

**Migration**: 使用 Agent tool decision / final result 协议；模型只能请求 registry 中的合法工具或返回合法 `AgentExecutionResult`。

### Requirement: 只读工具执行必须经过服务端校验

**Reason**: 校验要求仍正确，但不属于独立只读 loop。

**Migration**: 在 Agent tool executor 中执行 Schema、权限、候选集合、摘要、预算和 trace 校验。

### Requirement: LLM 只读 tool loop 必须受步数和预算限制

**Reason**: 独立 loop 的步数、耗时和上下文 bundle 预算不再适用。

**Migration**: Agent runtime 统一控制 step limit、timeout、tool result 摘要大小和 dependency graph。

### Requirement: 只读工具结果必须摘要化后再进入模型上下文

**Reason**: 摘要要求仍正确，但应归属 Agent tool result 投影。

**Migration**: Agent tool result 必须生成模型可见摘要和 trace 摘要，并通过 `toolResultId` 被后续步骤引用。

### Requirement: 只读工具失败必须有确定性回退

**Reason**: 独立只读 loop fallback 会回到旧固定编排路径。

**Migration**: 读工具失败进入 Agent `blocked`、`failed`、`needs_clarification` 或继续使用已登记 tool results 的路径。

### Requirement: 只读 tool loop 必须可由服务端开关关闭

**Reason**: 读工具不再由旧 feature flag 控制。

**Migration**: 通过 Agent registry 工具启用状态、权限、预算和策略配置控制工具可用性。

### Requirement: 写能力不得通过只读 tool loop 暴露给 LLM

**Reason**: Tool-first Agent 允许受控写工具，但写入必须经过 Schema、权限、候选集合、Validator、Policy、Confirmation 和 Persistence。

**Migration**: 删除只读-only 限制；写工具必须注册为 Agent 受控工具，并声明领域能力合同和前置依赖。
