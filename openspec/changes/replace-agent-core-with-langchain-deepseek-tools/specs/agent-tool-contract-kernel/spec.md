## ADDED Requirements

### Requirement: Agent Tool 合同必须迁移为 LangChain Tool Wrapper
系统 SHALL 将生产 Agent tool 合同迁移为 LangChain tool wrapper。旧 `defineTool`、旧 `ToolRegistry` manifest 和旧 `AgentAction.tool_call` 不再作为生产 tool 调用合同。

#### Scenario: 新增业务 tool
- **WHEN** 后续实现新增或迁移业务 Agent tool
- **THEN** 实现 MUST 提供 LangChain tool wrapper
- **AND** wrapper MUST 声明稳定 tool name、中文 description、input schema 和 handler
- **AND** wrapper MUST 通过服务端 schema 校验 arguments
- **AND** wrapper MUST 调用领域 service 或 repository
- **AND** wrapper MUST 提供模型可见安全摘要、用户可见投影或 trace 摘要的分层边界

#### Scenario: tool wrapper 不完整
- **WHEN** tool wrapper 缺少 name、description、schema、handler 或安全投影边界
- **THEN** production tool catalog MUST 拒绝注册该 tool
- **AND** 未注册 tool MUST NOT 暴露给 DeepSeek native Tool Calling

### Requirement: Tool Wrapper 必须区分模型事实、用户投影和内部结果
系统 SHALL 禁止把完整 handler output 默认暴露给模型、用户事件或 trace。LangChain tool wrapper MUST 明确区分 model-visible summary、user projection、trace summary 和 internal result。

#### Scenario: tool 返回大 payload
- **WHEN** 业务 tool handler 产生完整动作详情、训练方案、artifact payload 或候选集合
- **THEN** wrapper MUST 只把安全摘要暴露给模型
- **AND** wrapper MUST 按白名单生成用户可见投影
- **AND** trace MUST 只记录脱敏摘要和关键 id
- **AND** internal result MAY 供本轮 validator 或 response adapter 使用，但 MUST NOT 直接进入模型上下文

### Requirement: Tool Wrapper 必须保留权限和副作用策略
系统 SHALL 在 LangChain tool wrapper 中保留 read / write / high risk / confirmation 等策略边界。模型请求 tool call 不代表副作用已经获准执行。

#### Scenario: 写入或高风险 tool 被调用
- **WHEN** DeepSeek native `tool_calls` 请求写入、保存、覆盖训练计划、写入用户记忆或其他高风险操作
- **THEN** wrapper MUST 先通过项目 policy / confirmation 边界
- **AND** 未确认或未授权时 MUST 拒绝副作用
- **AND** 模型或 LangChain runtime MUST NOT 生成或信任 confirmation hash

## REMOVED Requirements

### Requirement: M0 内核必须从空白运行时边界建立
**Reason**: 生产 Agent runtime 将由 LangChain agent harness 承担，不再维护项目自研 M0 `agent-core` 作为长期核心。

**Migration**: 使用 `langchain-agent-runtime` 中的 LangChain Agent Runtime 和 LangChain tool wrapper 要求替代。

### Requirement: Tool 定义必须形成可启动校验的合同
**Reason**: 旧 `defineTool` 合同服务于自研 `ToolRegistry` 和旧 `AgentAction.tool_call`。迁移后生产工具由 LangChain tool wrapper 注册。

**Migration**: 将 input/output schema、policy metadata、projection 和 handler 边界迁移到 LangChain tool wrapper 和 production tool catalog。

### Requirement: ToolRegistry 必须生成安全 manifest
**Reason**: DeepSeek native Tool Calling 需要 provider `tools` / LangChain tool schema，而不是旧 `ToolRegistry.serializeForPlanner()` manifest。

**Migration**: 由 LangChain tool schema、description 和 production tool catalog 生成模型可见工具集合；安全摘要和 examples 按新的 tool wrapper 规则维护。

### Requirement: PlannerPort 必须与具体模型协议解耦
**Reason**: 旧 `PlannerPort` 是自研 Agent loop 的 planner 边界。迁移后 LangChain agent harness 负责模型调用和 tool calling loop。

**Migration**: 通过 LangChain model factory / provider adapter 隔离 DeepSeek 配置；生产代码不再实现旧 `PlannerPort`。

### Requirement: AgentAction 必须经过确定性校验
**Reason**: 模型不再输出旧 `AgentAction` JSON。DeepSeek native `tool_calls` 由 LangChain tool wrapper 和服务端 schema / policy / validator 校验。

**Migration**: 用 provider tool call 校验、LangChain tool schema、wrapper Zod 校验、结构化终态 validator 和 response adapter 替代旧 Action Validator。

### Requirement: Executor 必须通用执行 tool 并归一化结果
**Reason**: 旧 Executor 只服务自研 `ToolRegistry`。迁移后 LangChain runtime 调用 tool wrapper，wrapper 负责服务端校验、执行和归一化。

**Migration**: 每个 LangChain tool wrapper 必须返回稳定成功 / 失败摘要，并由 runtime trace 记录执行结果。

### Requirement: Runtime 必须完成 M0 单步和多步循环
**Reason**: 单步、多步和继续调用工具的循环由 LangChain agent harness 承担，不再维护自研 runtime loop。

**Migration**: 通过 LangChain agent run budget、tool call budget、timeout 和 wrapper errors 控制循环。

### Requirement: Observation 必须使用安全投影
**Reason**: 旧 observation 是旧 planner 输入层。迁移后模型可见事实来自 LangChain tool result message 或等价模型上下文。

**Migration**: LangChain tool wrapper MUST 返回安全 model-visible summary，不得把完整 handler output 直接返回给模型。

### Requirement: 默认 Response Renderer 必须输出安全 NDJSON 事件
**Reason**: 旧 Response Renderer 消费旧 `AgentRunResult`。迁移后 LangChain run result 由 production response adapter 投影。

**Migration**: 使用 LangChain production response adapter 输出 NDJSON 白名单事件。

### Requirement: Fixture read tool 必须证明 M0 端到端闭环
**Reason**: 旧 M0 fixture tool 不再代表生产 runtime 验收。

**Migration**: 新测试应覆盖 LangChain test tool wrapper、DeepSeek native tool call fixture、production tool catalog 和 response adapter。
