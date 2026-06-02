## ADDED Requirements

### Requirement: 第一阶段必须交付通用完整闭环
系统 SHALL 在第一阶段完整交付通用 Agent Tool 编排器闭环。该闭环 MUST 覆盖 `defineTool`、`ToolRegistry`、tool manifest 序列化、input/output schema 校验、resource contract 校验、Planner 输出 `AgentAction`、多轮 tool call、`maxSteps` / timeout 防死循环、`consumable` / `diagnostic` 资源角色、Policy Guard、confirmation action hash、Response Adapter、trace / replay fixture、`/api/chat` NDJSON 接入，以及无业务 fixture tools 的端到端验证。

#### Scenario: 15 项通用闭环能力全部存在
- **WHEN** 第一阶段实现完成并运行验收测试
- **THEN** 测试 MUST 逐项证明 15 项通用闭环能力已经实现
- **AND** 任一核心能力缺失 MUST 使验收失败

#### Scenario: 不提前实现业务工具
- **WHEN** 第一阶段实现 tool 相关能力
- **THEN** 实现 MUST 只提供通用 tool bundle 合同、registry 和无业务 fixture tools
- **AND** 实现 MUST NOT 提前实现具体业务 tool

### Requirement: Agent core 必须只依赖通用工具合同
系统 SHALL 建立新的 Agent core。Agent core MUST NOT 依赖具体业务 tool name、旧 `AgentOrchestrator`、旧 `AgentExecutionResult`、旧 response writer、旧 intent-first 路径或旧 readonly loop。业务能力扩展 MUST 通过注册 tool bundle 完成。

#### Scenario: 新增工具不修改核心循环
- **WHEN** 开发者新增一个合法 tool bundle 并注册到 `ToolRegistry`
- **THEN** orchestrator runtime、planner loop、executor、policy guard、resource contract validator、Response Adapter 主流程和 `/api/chat` 接入层 MUST 不需要新增业务分支
- **AND** 新 tool MUST 能通过 manifest 暴露给 Planner

#### Scenario: 旧实现残留冲突
- **WHEN** 旧 Agent core、旧 open change 或旧测试夹具与新 core 行为冲突
- **THEN** 实现 MUST 以 `docs/agent-tool-orchestrator-design.md` 和本 capability 为准
- **AND** 生产路径 MUST NOT 为旧实现增加兼容层

### Requirement: Tool 必须通过 defineTool 声明完整 bundle
系统 SHALL 提供 `defineTool()`，用于声明单一职责 tool bundle。每个 tool bundle MUST 包含 manifest、input schema、output schema、resource contract、policy metadata、handler、trace projection 和 response adapter。

#### Scenario: 注册合法 tool
- **WHEN** tool 通过 `defineTool()` 声明完整合同
- **THEN** TypeScript 类型 MUST 能收敛 input、output 和 handler 返回值
- **AND** registry MUST 能读取该 tool 的 manifest、schema、resource contract、policy metadata 和 response adapter

#### Scenario: tool 缺少核心合同
- **WHEN** tool 缺少 input schema、output schema、resource contract、handler 或 response adapter
- **THEN** 注册 MUST 失败
- **AND** 失败 MUST 返回结构化错误，便于测试定位缺失字段

### Requirement: ToolRegistry 必须支持安全 manifest 序列化
系统 SHALL 提供 `ToolRegistry` 管理 tool 注册、查询、可用性筛选和 manifest 序列化。发送给 Planner 的 manifest MUST 只包含模型可见安全字段。

#### Scenario: Planner 获取可用工具
- **WHEN** Agent run 开始并根据当前 user/session/context 查询可用 tools
- **THEN** registry MUST 返回已授权且启用的 tool manifests
- **AND** manifest MUST 包含 tool name、description、input schema 摘要、output 摘要、resource contract、risk metadata 和 examples
- **AND** manifest MUST NOT 包含 handler、数据库对象、完整 payload 或用户敏感原始数据

#### Scenario: 重复注册 tool
- **WHEN** 两个 tool 使用相同 `name` 注册
- **THEN** registry MUST 拒绝重复注册
- **AND** 错误 MUST 指出冲突 tool name

### Requirement: Planner 必须输出结构化 AgentAction
系统 SHALL 通过模型 structured output 获取 `AgentAction`。`AgentAction` MUST 支持 `tool_call`、`final_answer`、`ask_user` 和 `request_confirmation`。

#### Scenario: Planner 请求调用 tool
- **WHEN** Planner 输出 `tool_call`
- **THEN** action MUST 包含已注册 `toolName`、符合 input schema 的 `input`、自然语言 `reason` 和可选 `consumes`
- **AND** Action Validator MUST 在执行前校验 tool 存在、input schema 合法和 consumes 引用可访问

#### Scenario: Planner 输出非法 action
- **WHEN** Planner 输出未知 tool、非法 input、非法 terminal action 或引用不可消费资源
- **THEN** runtime MUST 进入结构化 repair、ask_user 或 failed 结果
- **AND** 服务端 MUST NOT 根据用户原文把 action 改写成另一种业务语义

### Requirement: Runtime 必须支持多轮 tool call 和防循环边界
系统 SHALL 提供通用 Agent runtime，循环执行 Planner action、tool execution、observation 和终止收口。Runtime MUST 支持 `maxSteps`、overall timeout、per-tool timeout 和重复失败熔断。

#### Scenario: 多轮工具调用成功
- **WHEN** Planner 连续输出多个合法 `tool_call`
- **THEN** runtime MUST 逐轮执行工具、登记 tool results、生成 observation 并继续调用 Planner
- **AND** 后续 action MUST 能引用当前 run 已登记的 consumable resources

#### Scenario: 超过 maxSteps
- **WHEN** Agent run 达到 `maxSteps` 仍未产生 terminal action
- **THEN** runtime MUST 停止循环
- **AND** runtime MUST 返回结构化失败或 ask_user 结果
- **AND** trace MUST 记录停止原因为 `max_steps_exceeded` 或等价稳定 code

#### Scenario: 重复工具失败
- **WHEN** 同一 run 中相同 toolName、规范化 input 和 failure code 重复出现
- **THEN** runtime MUST 熔断该重复调用
- **AND** runtime MUST 把失败作为 diagnostic observation 或结构化终止结果记录

### Requirement: Tool 执行必须校验 input/output 和 resourceContract
系统 SHALL 在执行 tool 前校验 input schema，在执行后校验 output schema 和 resource contract。Tool result MUST 标记 resource role 为 `consumable` 或 `diagnostic`。

#### Scenario: tool 产生可消费资源
- **WHEN** tool output 满足 output schema 和 resource contract
- **THEN** runtime MUST 登记 toolResultId、produced resources、resource role 和 fulfillment evidence
- **AND** 下游 tool 或 final answer MUST 只能消费当前 run 中已登记的 consumable resources

#### Scenario: tool 只产生诊断结果
- **WHEN** tool output 未满足可消费资源要求但提供诊断信息
- **THEN** runtime MUST 将结果标记为 `diagnostic`
- **AND** 下游写入类 tool MUST NOT 消费该 diagnostic resource

### Requirement: Policy Guard 必须控制权限、风险和确认
系统 SHALL 在 tool execution 前运行 Policy Guard。Policy Guard MUST 根据 user/session 权限、tool policy metadata、risk level、side effect 和 confirmation state 决定允许、拒绝或要求确认。

#### Scenario: 低风险读工具通过
- **WHEN** Planner 请求调用低风险只读 tool 且当前用户具备权限
- **THEN** Policy Guard MUST 允许执行
- **AND** trace MUST 记录 policy decision

#### Scenario: 写工具需要确认
- **WHEN** Planner 请求调用需要确认的写 tool 且当前请求没有有效 confirmation
- **THEN** Policy Guard MUST 阻止 tool handler 执行
- **AND** runtime MUST 生成 `request_confirmation` action 或等价确认事件
- **AND** confirmation action hash MUST 由服务端根据稳定 action payload、userId、conversationId、toolName、resource refs 和过期时间生成

### Requirement: Response Adapter 必须只投影真实执行结果
系统 SHALL 提供通用 Response Adapter，将 terminal action、tool results 和 registered tool response adapters 转成 `/api/chat` NDJSON 事件。Response Adapter MUST NOT 编造 tool 未产生的用户可见结果。

#### Scenario: final answer 引用 tool result
- **WHEN** terminal action 引用当前 run 的 tool results
- **THEN** Response Adapter MUST 从已登记 tool results 和对应 tool response adapter 生成 `content`、`tool_result`、`assistant_suggestions`、`confirmation_request`、`error` 或 `done` 事件
- **AND** Response Adapter MUST 校验被引用资源存在且角色允许投影

#### Scenario: final answer 引用不存在资源
- **WHEN** terminal action 引用不存在、跨 run 或 diagnostic-only 的资源作为成功结果
- **THEN** Response Adapter MUST 拒绝成功投影
- **AND** runtime MUST 返回结构化合同失败或可恢复错误

### Requirement: `/api/chat` 必须接入新 Agent core NDJSON 闭环
系统 SHALL 让 `/api/chat` 使用新 Agent core 处理聊天请求。`/api/chat` MUST 保留认证、请求校验、服务端 hydration、trace id 和 NDJSON stream 边界，但 MUST NOT 回退旧 Agent core。

#### Scenario: 聊天请求进入新 core
- **WHEN** 用户发送合法 `/api/chat` 请求
- **THEN** 服务端 MUST 构造 context package 并调用新 Agent runtime
- **AND** stream MUST 输出新 Response Adapter 生成的 NDJSON 事件
- **AND** stream MUST 以 `done` 或结构化错误事件收口

#### Scenario: 旧 core 导入扫描
- **WHEN** 架构测试扫描 `/api/chat`、聊天服务和 stream response 生产路径
- **THEN** 测试 MUST 证明这些路径不导入旧 `runAgentOrchestrator()`、旧 `AgentExecutionResult`、旧 response writer、旧 intent-first 或旧 readonly loop

### Requirement: Trace 和 replay fixture 必须覆盖完整运行链路
系统 SHALL 记录 Agent run trace，并提供 replay fixture。Trace MUST 覆盖 context 摘要、tool manifest、planner action、policy decision、tool input/output 摘要、resource refs、terminal action 和 response events。

#### Scenario: 记录成功 run
- **WHEN** Agent run 成功产生用户可见结果
- **THEN** trace MUST 记录每轮 action、tool result、resource role、policy decision 和 response event 摘要
- **AND** trace MUST 遵守脱敏和长度限制

#### Scenario: replay 不调用真实模型
- **WHEN** 测试使用 replay fixture 提供 planner actions
- **THEN** runtime MUST 能在不调用真实模型的情况下重放 tool loop、resource validation、policy guard 和 response adapter
- **AND** replay 结果 MUST 可用于断言 NDJSON 事件和 resource contract

### Requirement: 无业务 fixture tools 必须证明完整闭环
系统 SHALL 在第一阶段提供无业务 fixture tools 验证完整闭环。Fixture tools MUST 覆盖只读调用、资源生产、资源消费、需要确认的写调用、诊断失败和 response projection。

#### Scenario: fixture tool 端到端调用
- **WHEN** replay fixture 或 `/api/chat` 测试注册无业务 fixture tools
- **THEN** Planner manifest MUST 能发现这些 tools
- **AND** runtime MUST 能执行 tool call、校验 input/output schema、登记 tool results、生成 observation 并继续多轮调用
- **AND** Response Adapter MUST 能输出 NDJSON events 并以 `done` 收口

#### Scenario: fixture resource 被消费
- **WHEN** resource producer fixture 产生 consumable resource
- **THEN** resource consumer fixture MUST 能通过 `consumes` 引用该 resource
- **AND** resource validator MUST 拒绝不存在、跨 run 或 diagnostic-only resource

#### Scenario: fixture 写操作需要确认
- **WHEN** confirmation write fixture 未携带有效 confirmation
- **THEN** Policy Guard MUST 阻止 handler 执行
- **AND** runtime MUST 输出 confirmation request 和 action hash

### Requirement: 后续功能必须能通过只注册 tool 扩展
系统 SHALL 提供扩展验收，证明新增业务能力只需新增并注册 tool bundle。Tool bundle MUST 自带 manifest、schema、resource contract、policy metadata、handler、trace projection 和 response adapter。

#### Scenario: 添加测试用扩展 tool
- **WHEN** 测试新增一个测试用 tool bundle 并注册
- **THEN** Planner manifest MUST 出现该 tool
- **AND** runtime MUST 能执行该 tool 并校验 output/resource contract
- **AND** Response Adapter MUST 能通过该 tool 的 adapter 输出 NDJSON 事件
- **AND** orchestrator 主循环代码 MUST 不发生修改

#### Scenario: tool 试图要求 orchestrator 特殊分支
- **WHEN** 新 tool 只能通过修改 orchestrator、executor、policy guard、response adapter 主流程或 `/api/chat` 主链才能工作
- **THEN** 该 tool 扩展 MUST 被视为不合格
- **AND** 实现 MUST 将缺失能力补入 tool bundle 合同或通用 core 合同
