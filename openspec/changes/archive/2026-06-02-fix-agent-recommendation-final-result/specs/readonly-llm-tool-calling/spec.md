## MODIFIED Requirements

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
- **AND** 测试 MUST NOT 继续断言独立只读 loop 的触发矩阵、stop reason 或旧固定编排路径

#### Scenario: searchExercises 工具定义暴露受控 facet
- **WHEN** Agent decision 模型看到 `searchExercises` 的工具定义
- **THEN** 工具定义 MUST 明确要求优先使用结构化筛选字段，包括 `bodyRegions`、`allowedSections`、`level`、`equipment` 或 `equipmentRequired`
- **AND** 工具定义 MUST 提供短小的真实动作库 facet 摘要或示例
- **AND** 工具定义 MUST NOT 要求模型猜测数据库不存在的 `targetMuscles` 或 `equipment` 值
