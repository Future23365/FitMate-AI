## REMOVED Requirements

### Requirement: Agent tools 必须声明能力合同

**Reason**: 能力合同原则正确，但当前 requirement 绑定旧 Agent tool 外壳、旧 capability type 和旧 registry。

**Migration**: 删除旧 capability contract；后续新 `defineTool` 和 Tool manifest 重新定义能力、输入、输出、资源和 policy 合同。

### Requirement: LLM 调用复杂 tool 时必须提交结构化 ToolRequest

**Reason**: 旧 `ToolRequest` 绑定当前旧 tool capability contract 和旧 executor 校验。

**Migration**: 后续新 Planner 输出 `AgentAction`，并重新定义复杂 tool 的结构化请求合同。

### Requirement: ToolResult 必须证明满足 ToolRequest

**Reason**: 当前证明链绑定旧 `ToolResult`、旧 request id、旧 evidence 字段和旧 trace 投影。

**Migration**: 后续新 core 重新定义 tool fulfillment、evidence、resource contract 和 trace/replay 证据。

### Requirement: Tool 必须严格执行 LLM 传入参数

**Reason**: 该原则正确，但旧 requirement 绑定当前旧 tool 外壳中的参数执行策略。

**Migration**: 后续新 tools 继续遵守“Tool 不做语义决策”的边界，并在新 tool contract 中重新表达。

### Requirement: Tool 能力类型必须覆盖当前 Agent 工具

**Reason**: 当前能力类型是为旧 Agent tools 补齐的分类，删除旧 tools 后不再适用。

**Migration**: 后续新 tools 按重新设计的单一职责能力集合定义，不继承旧 capability enum。

### Requirement: Tool 执行证据必须进入 trace 和黑盒报告

**Reason**: 当前证据字段绑定旧 trace event、旧黑盒报告字段和旧 tool result 结构。

**Migration**: 保留“执行证据必须可审计”的经验；后续新 core 重新定义 trace、replay fixture 和黑盒报告字段。
