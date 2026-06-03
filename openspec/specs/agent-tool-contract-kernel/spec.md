# agent-tool-contract-kernel Specification

## Purpose
TBD - created by archiving change add-agent-tool-contract-kernel-m0. Update Purpose after archive.
## Requirements
### Requirement: M0 内核必须从空白运行时边界建立

系统 SHALL 新增通用 `Agent Tool` 合同内核，并与旧 `lib/server/agent-orchestrator/**`、旧 `AgentExecutionResult`、旧 Response Writer、旧 prompt module 和旧业务 toolName 分支解耦。

#### Scenario: 新内核不复用旧 Agent runtime
- **WHEN** 实现 M0 合同内核
- **THEN** 运行时代码 MUST 位于新的 `lib/server/agent-core/**` 或等价新内核目录
- **AND** 新内核 MUST NOT 导入或调用旧 `lib/server/agent-orchestrator/**`
- **AND** 新内核 MUST NOT 依赖旧 `AgentExecutionResult`、旧 `AgentToolRegistry`、旧 Response Writer 或旧 prompt module

#### Scenario: M0 不接入生产聊天主链
- **WHEN** M0 change 完成实现
- **THEN** production `/api/chat` 行为 MUST NOT 因本 change 改变
- **AND** `/api/chat` MUST NOT 直接调用 M0 fixture runtime 作为生产 AI 主链
- **AND** 真实聊天接入 MUST 留给后续具备 LLM adapter、Policy、Resource、Trace 和回归测试的 change

#### Scenario: Runtime 不包含业务语义分支
- **WHEN** Runtime 执行任意 planner action
- **THEN** Runtime MUST NOT 基于具体业务 `toolName` 写分支
- **AND** Runtime MUST NOT 读取用户自然语言关键词、正则、同义词表或模板来选择 tool
- **AND** Runtime MUST 只根据 registry、schema、policy metadata、运行预算和 action 校验结果做确定性处理

### Requirement: Tool 定义必须形成可启动校验的合同

系统 SHALL 提供 `defineTool` 或等价入口定义 tool，并在注册或启动阶段校验 tool 的名称、版本、输入 Schema、输出 Schema、策略元数据和模型可见安全字段。

#### Scenario: 定义合法 read fixture tool
- **WHEN** 开发者用 `defineTool` 定义 M0 read fixture tool
- **THEN** tool MUST 声明 `name`、`version`、`description`、`whenToUse`、`whenNotToUse`、`inputSchema`、`outputSchema`、`policy` 和 `handler`
- **AND** `policy.sideEffect` MUST 为 `read`
- **AND** `policy.riskLevel` MUST 为 `low`
- **AND** `policy.confirmation` MUST 为 `never`

#### Scenario: Tool 合同不完整
- **WHEN** tool 缺少 name、version、inputSchema、outputSchema、policy 或 handler
- **THEN** `defineTool` 或 registry MUST 拒绝该 tool
- **AND** 拒绝结果 MUST 包含稳定错误 code
- **AND** 系统 MUST NOT 将不完整 tool 暴露给 Planner 或 Executor

#### Scenario: M0 遇到非安全只读 tool
- **WHEN** M0 Runtime 遇到 write、high risk 或需要 confirmation 的 tool
- **THEN** Runtime MUST 拒绝执行该 tool
- **AND** 拒绝结果 MUST 表示该能力需要 M1 Policy Guard 或 confirmation 支持
- **AND** Runtime MUST NOT 在缺少 Policy Guard 的情况下执行写入、副作用或高风险 handler

### Requirement: ToolRegistry 必须生成安全 manifest

系统 SHALL 通过 `ToolRegistry` 注册 tool、查询 tool、列出当前上下文可用 tool，并将可用 tool 序列化为 Planner 可见的 `ToolManifest[]`。

#### Scenario: 注册和读取 tool
- **WHEN** 系统注册 read fixture tool
- **THEN** `ToolRegistry.get(toolName)` MUST 返回该 tool
- **AND** 重复 name 的 tool MUST 被拒绝或产生稳定注册错误
- **AND** 未注册 tool MUST NOT 被 Executor 执行

#### Scenario: 生成 Planner manifest
- **WHEN** Runtime 为 Planner 准备可用工具列表
- **THEN** `ToolRegistry` MUST 生成 `ToolManifest[]`
- **AND** manifest MUST 包含 tool name、version、description、whenToUse、whenNotToUse、inputJsonSchema、安全 policy hint 和安全 examples
- **AND** manifest MUST NOT 包含 handler、数据库对象、secret、完整用户 payload 或服务端 capability 对象

#### Scenario: Manifest 保留关键 Schema 结构
- **WHEN** tool inputSchema 包含 object、array、record、union、enum、required 或 nested fields
- **THEN** manifest 的 `inputJsonSchema` MUST 保留这些执行关键结构
- **AND** 系统 MUST NOT 为了压缩 token 而丢弃 required 字段、关键 enum 或 nested 字段

### Requirement: PlannerPort 必须与具体模型协议解耦

系统 SHALL 定义 `PlannerPort` 作为 core 唯一 planner 入口，Planner 只接收 runtime state 和 tool manifest，并只返回结构化 `AgentAction`。

#### Scenario: ReplayPlanner 驱动成功工具调用
- **WHEN** Runtime 使用 `ReplayPlanner` 执行固定 action 序列
- **THEN** `ReplayPlanner` MUST 通过 `PlannerPort.decideNext()` 返回下一个 `AgentAction`
- **AND** core MUST NOT 依赖 OpenAI、Anthropic、function calling、JSON mode 或具体 SDK 类型
- **AND** Runtime MUST 能在没有真实 LLM 的测试中完成工具调用和终止收口

#### Scenario: Planner 输出 confirmation action
- **WHEN** Planner 输出 `{ type: "request_confirmation" }` 或等价 action
- **THEN** Action Validator MUST 拒绝该 action
- **AND** Runtime MUST NOT 信任 Planner 生成的 confirmation hash、pendingActionId 或用户可见确认事件

### Requirement: AgentAction 必须经过确定性校验

系统 SHALL 定义 `AgentAction` Schema，并在执行前校验 `tool_call`、`final_answer` 和 `ask_user` 的结构、引用和可执行边界。

#### Scenario: 合法 tool_call
- **WHEN** Planner 返回 `tool_call`
- **THEN** Action Validator MUST 校验 action 结构合法
- **AND** `toolName` MUST 已注册且当前可用
- **AND** `input` MUST 通过对应 tool 的 `inputSchema`
- **AND** 只有校验通过后 Runtime 才能调用 Executor

#### Scenario: 未知 tool 或非法 input
- **WHEN** Planner 返回未知 `toolName` 或不符合 Schema 的 `input`
- **THEN** Runtime MUST NOT 执行 handler
- **AND** Runtime MUST 生成可诊断 invalid action observation 或 terminal error
- **AND** 错误 MUST 包含稳定 code，便于测试和后续 repair

#### Scenario: M0 action 引用资源
- **WHEN** Planner 在 `tool_call.consumes`、`final_answer.usedResourceRefs` 或 `ask_user.usedResourceRefs` 中传入非空 resource 引用
- **THEN** Action Validator MUST 拒绝该 action
- **AND** 拒绝结果 MUST 表示 ResourceStore 与 Resource Contract 属于 M1
- **AND** Runtime MUST NOT 把未登记 resource 当成成功事实或用户可见依据

#### Scenario: 合法 terminal action
- **WHEN** Planner 返回 `final_answer` 或 `ask_user`
- **THEN** Action Validator MUST 校验 `usedToolResultIds` 均来自当前 run 已登记 tool result
- **AND** terminal action MUST NOT 携带任意 NDJSON event、未登记 resource 或 handler output
- **AND** Runtime MUST 基于该 terminal action 和已校验结果收口

### Requirement: Executor 必须通用执行 tool 并归一化结果

系统 SHALL 提供通用 Executor 调用 tool handler，并统一处理输入 Schema、输出 Schema、per-tool timeout、AbortSignal、异常、错误 code 和 `ToolResult` 归一化。

#### Scenario: 执行成功 read fixture tool
- **WHEN** Executor 执行已校验的 read fixture `tool_call`
- **THEN** Executor MUST 调用对应 tool handler
- **AND** handler 输出 MUST 通过 tool 的 `outputSchema`
- **AND** Executor MUST 返回包含 `toolName`、`toolVersion`、`toolResultId`、`ok: true` 和安全 projection 的 `ToolResult`

#### Scenario: Handler 抛出异常
- **WHEN** tool handler 抛出异常
- **THEN** Executor MUST 捕获异常
- **AND** Executor MUST 返回 `ok: false` 的 `ToolResult`
- **AND** 错误 MUST 归一化为稳定 `ToolError.code`
- **AND** Runtime MUST NOT 让异常越过通用执行边界

#### Scenario: Tool 输出 Schema 不合法
- **WHEN** handler 返回不符合 `outputSchema` 的 output
- **THEN** Executor 或 Runtime MUST 将结果标记为合同失败
- **AND** 不合法 output MUST NOT 进入 observation、Response Renderer 或用户可见 payload

#### Scenario: Tool 执行超时或取消
- **WHEN** tool 执行超过 `perToolTimeoutMs` 或收到 abort signal
- **THEN** Executor MUST 停止等待该 tool
- **AND** Executor MUST 返回 timeout 或 aborted 类结构化失败
- **AND** Runtime MUST 能以错误结果继续收口或进入 repair/失败路径

### Requirement: Runtime 必须完成 M0 单步和多步循环

系统 SHALL 提供通用 Runtime loop，按 `manifest -> planner -> action validation -> terminal handling -> executor -> result validation -> observation -> next step` 顺序运行，直到终止或触发边界。

#### Scenario: 单次 read tool 后 final answer
- **WHEN** `ReplayPlanner` 先返回 read fixture `tool_call`，再返回 `final_answer`
- **THEN** Runtime MUST 先执行 read fixture tool
- **AND** Runtime MUST 登记本轮 `ToolResult`
- **AND** 下一轮 Planner 输入 MUST 能看到安全 observation
- **AND** Runtime MUST 用 `final_answer.usedToolResultIds` 引用本轮 tool result 后完成收口

#### Scenario: Runtime 达到 maxSteps
- **WHEN** Planner 持续返回未终止 action 直到超过 `maxSteps`
- **THEN** Runtime MUST 停止循环
- **AND** Runtime MUST 返回结构化 terminal error
- **AND** Runtime MUST NOT 继续调用 Planner 或 Executor

#### Scenario: Runtime 达到整体超时
- **WHEN** 当前 run 超过 `overallTimeoutMs`
- **THEN** Runtime MUST 停止循环
- **AND** Runtime MUST 返回 timeout terminal error
- **AND** Runtime MUST 尝试取消后续 tool 执行

#### Scenario: 非法 action repair 超限
- **WHEN** Planner 连续输出非法 action 并超过 M0 repair 次数限制
- **THEN** Runtime MUST 停止 repair
- **AND** Runtime MUST 返回包含最后失败 code 的 terminal error
- **AND** Runtime MUST NOT 通过服务端语义 fallback 改写 action

#### Scenario: 重复不可重试失败熔断
- **WHEN** 同一 `toolName + toolVersion + normalizedInputHash + failureCode` 反复出现不可重试失败
- **THEN** Runtime MUST 熔断重复执行
- **AND** Runtime MUST 记录可测试的 duplicate failure code
- **AND** Runtime MUST NOT 再次调用相同 handler

### Requirement: Observation 必须使用安全投影

系统 SHALL 将 tool result 转换成 Planner 可见 observation，并确保 observation 只来自安全投影或默认安全摘要。

#### Scenario: Tool 提供 model projection
- **WHEN** tool result 包含 `projection.model` 或 `toModelObservation`
- **THEN** Runtime MUST 使用该安全投影生成 observation
- **AND** observation MUST 标注来源为 tool
- **AND** observation MUST NOT 被提升为 system 指令

#### Scenario: Tool 未提供 model projection
- **WHEN** tool result 没有模型可见投影
- **THEN** Runtime MUST 使用默认安全摘要
- **AND** Runtime MUST NOT 将完整 `output` 默认塞入下一轮 Planner 输入

### Requirement: 默认 Response Renderer 必须输出安全 NDJSON 事件

系统 SHALL 提供默认 Response Renderer，将 terminal result、tool result 和标准化错误转换为白名单 NDJSON event，并输出 `done` 收口。

#### Scenario: 渲染 final answer
- **WHEN** Runtime 以合法 `final_answer` 收口
- **THEN** Response Renderer MUST 输出 `content` event
- **AND** Response Renderer MUST 输出 `done` event
- **AND** 用户可见内容 MUST 来自 terminal action 和已校验 tool result 的安全投影

#### Scenario: 渲染 ask_user
- **WHEN** Runtime 以合法 `ask_user` 收口
- **THEN** Response Renderer MUST 输出用户问题对应的 `content` event
- **AND** 如存在 suggestions，Response Renderer MUST 输出白名单建议事件或等价安全投影
- **AND** Response Renderer MUST 输出 `done` event

#### Scenario: 渲染 tool result
- **WHEN** Runtime 需要输出 tool result 事件
- **THEN** Response Renderer MUST 使用 `projection.user` 或默认安全摘要
- **AND** Response Renderer MUST NOT 默认暴露完整 `output`
- **AND** tool 自定义用户事件如未实现，默认 renderer MUST 仍能完成 M0 输出

#### Scenario: 渲染错误
- **WHEN** Runtime 以结构化失败收口
- **THEN** Response Renderer MUST 输出 `error` event
- **AND** error event MUST 包含稳定 code、message 和 retryable
- **AND** Response Renderer MUST 输出 `done` event

### Requirement: Fixture read tool 必须证明 M0 端到端闭环

系统 SHALL 提供只读 fixture tool 和自动化测试，证明新增并注册一个 tool 即可被 manifest 暴露、被 `ReplayPlanner` 选择、被 Executor 调用，并通过默认 Response Renderer 输出 NDJSON。

#### Scenario: Fixture read tool 端到端执行
- **WHEN** 测试注册 M0 read fixture tool 并使用 `ReplayPlanner` 请求该 tool
- **THEN** manifest MUST 暴露该 fixture tool 的安全合同
- **AND** Runtime MUST 调用 Executor 执行该 tool
- **AND** Executor MUST 返回通过 outputSchema 校验的 `ToolResult`
- **AND** Runtime MUST 生成安全 observation
- **AND** Response Renderer MUST 输出 `content`、可选 `tool_result` 和 `done` NDJSON event

#### Scenario: 新增 fixture tool 不改 core 主流程
- **WHEN** 开发者新增另一个等价 read fixture tool
- **THEN** 开发者 MUST 只新增 tool 文件、注册 tool 和合同测试
- **AND** 开发者 MUST NOT 修改 Runtime loop、PlannerPort、Executor 主流程、Action Validator 主流程、默认 Response Renderer 主流程或 production `/api/chat`

