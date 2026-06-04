## REMOVED Requirements

### Requirement: Agent tools 必须声明能力合同

**Reason**: 能力合同绑定旧 Agent tool 外壳、旧 capability type、旧 registry、旧 Prompt 暴露和旧执行器。运行时 AI/Agent 逻辑删除后，旧 Agent tool 能力合同必须失效。

**Migration**: 删除旧 capability contract、旧 registry 和旧 tool manifest。当前运行时不得保留 Agent tool 能力声明。

### Requirement: LLM 调用复杂 tool 时必须提交结构化 ToolRequest

**Reason**: 旧 `ToolRequest` 绑定旧 LLM tool calling、旧 capability contract、旧 executor 校验和旧 repair loop。

**Migration**: 删除旧 `ToolRequest`、旧 tool calling parser 和旧 repair feedback。生产代码不得继续要求模型提交旧结构化工具请求。

### Requirement: ToolResult 必须证明满足 ToolRequest

**Reason**: 当前证明链绑定旧 `ToolResult`、旧 request id、旧 evidence 字段、旧 resource id 和旧 trace 投影。

**Migration**: 删除旧 `ToolResult`、旧 evidence、旧 resource fulfillment 和旧 trace/replay 证据字段。

### Requirement: Tool 必须严格执行 LLM 传入参数

**Reason**: 该原则绑定旧 Agent tool 外壳中的参数执行策略。删除运行时 AI/Agent 后，不再存在旧 LLM 参数执行链路。

**Migration**: 删除旧 tool handler 和旧参数执行合同。未来如重新引入 AI，需要另起 change 重新定义，不继承旧工具外壳。

### Requirement: Tool 能力类型必须覆盖当前 Agent 工具

**Reason**: 当前能力类型是为旧 Agent tools 补齐的分类，删除旧 tools 后不再适用。

**Migration**: 删除旧 capability enum 和旧工具分类。当前运行时不保留 Agent tool 类型集合。

### Requirement: Tool 执行证据必须进入 trace 和黑盒报告

**Reason**: 当前证据字段绑定旧 trace event、旧黑盒报告字段、旧 tool result 结构和旧 manual LLM runner。

**Migration**: 删除旧工具执行证据、旧 trace 投影、旧 manual LLM 黑盒 runner 和旧报告字段。历史文档可保留旧经验描述，但不形成运行时要求。
