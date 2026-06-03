## ADDED Requirements

### Requirement: LlmPlanner 必须通过 PlannerPort 接入真实模型
系统 SHALL 提供 `LlmPlanner` 或等价实现，通过 `PlannerPort` 调用真实模型并产出结构化 `AgentAction` candidate。`LlmPlanner` MUST NOT 执行 tool、生成 confirmation hash、生成任意 NDJSON event 或绕过 Action Validator / Policy Guard / Executor。

#### Scenario: LlmPlanner 只返回 AgentAction candidate
- **WHEN** `LlmPlanner` 收到 runtime state 和 tool manifest
- **THEN** 它 MUST 调用模型并解析出 `tool_call`、`final_answer` 或 `ask_user` 之一
- **AND** 该 action MUST 交给 Action Validator 校验后才能继续运行
- **AND** `LlmPlanner` MUST NOT 直接调用 tool handler

#### Scenario: 非法模型输出进入 repair 或失败收口
- **WHEN** DeepSeek 返回非法 JSON、未知 action、未知 tool、非法 input 或非法 resource refs
- **THEN** Runtime MUST 将其作为 invalid action 处理
- **AND** 系统 MUST 使用结构化 observation 触发有限 repair 或按预算失败收口
- **AND** 系统 MUST NOT 基于用户自然语言关键词改写模型语义 action

### Requirement: M2 只实现 DeepSeek ModelAdapter
系统 SHALL 定义模型无关 `ModelAdapter` 合同，并在本 change 中只实现 `DeepSeekModelAdapter`。`agent-core` MUST NOT 导入 DeepSeek SDK、DeepSeek HTTP client 或 DeepSeek 专有响应格式。

#### Scenario: DeepSeek adapter 封装供应商协议
- **WHEN** `LlmPlanner` 使用 `DeepSeekModelAdapter`
- **THEN** DeepSeek 请求构造、模型参数、响应解析和错误归一化 MUST 位于 `agent-planners` 或 `model-adapters` 边界内
- **AND** `agent-core` MUST 只接收 `PlannerPort` 输出的 `AgentAction`

#### Scenario: 替换 adapter 不修改 agent-core
- **WHEN** 测试用 fake adapter 或未来 adapter 替换 `DeepSeekModelAdapter`
- **THEN** `agent-core`、Runtime、Action Validator、Policy Guard、Executor 和 Response Renderer MUST NOT 需要代码改动
- **AND** adapter contract test MUST 能证明 core 不依赖 DeepSeek 专有格式

### Requirement: Manifest 必须具备 manifestHash 和 registry snapshot
系统 SHALL 为每次 run 生成 manifestHash 和 registry snapshot。snapshot MUST 记录模型可见的 tool contract、安全 policy hint、resource contract、tool version、examples 摘要和 linter 结果，并禁止记录 handler、capabilities、secret、数据库对象或完整敏感 payload。

#### Scenario: 每次 run 记录 manifestHash
- **WHEN** Runtime 启动一次 run 并序列化可用 tool manifest
- **THEN** Runtime MUST 生成稳定 manifestHash
- **AND** manifestHash MUST 写入 trace / replay 摘要或等价可审计结果
- **AND** 同一 manifest 内容 SHOULD 产生稳定 hash

#### Scenario: Registry snapshot 可回放
- **WHEN** Replay 使用某次 run 的 registry snapshot
- **THEN** 系统 MUST 能复现当时模型可见的 tool name、version、input schema、resource contract 和 policy hint
- **AND** snapshot MUST NOT 包含 tool handler、内部服务对象、secret 或完整用户数据

### Requirement: Tool manifest linter 必须阻断不安全 manifest
系统 SHALL 提供 tool manifest linter 或等价启动期校验，检查模型可见 manifest 是否缺失关键结构、暴露敏感字段或违反 tool contract 安全边界。

#### Scenario: 拒绝泄漏内部字段的 manifest
- **WHEN** tool manifest 包含 handler、capabilities、secret、token、数据库连接对象或完整内部 output 示例
- **THEN** manifest linter MUST 报告失败
- **AND** 该 tool MUST NOT 进入 Planner 可见 manifest

#### Scenario: 保留执行关键 schema 结构
- **WHEN** tool input schema 包含 nested object、array、enum、union、record 或 required 字段
- **THEN** manifest linter MUST 验证 manifest 没有压扁或丢失执行关键结构
- **AND** 测试 MUST 覆盖复杂 schema 的安全序列化

### Requirement: Redaction 策略必须保护 manifest、observation、user event 和 trace
系统 SHALL 提供统一 redaction 策略，所有进入模型、用户事件和 trace 的 tool result、resource summary、policy decision、confirmation result 和 planner observation MUST 先通过安全 projection / redaction。

#### Scenario: Tool output 不默认进入模型
- **WHEN** tool handler 返回完整 output 且未提供安全 `projection.model`
- **THEN** Planner observation MUST 只包含默认安全摘要、toolResultId、resource ref、fulfillment 和错误码
- **AND** observation MUST NOT 包含完整 handler output、secret、数据库对象或内部 capability

#### Scenario: User event 不泄漏完整 input
- **WHEN** Response Renderer 输出 tool result 或 confirmation request
- **THEN** 用户事件 MUST 只包含白名单字段和安全 message
- **AND** 用户事件 MUST NOT 包含完整 tool input、server secret、handler output 或未脱敏 resource payload

#### Scenario: Trace 脱敏审计发现泄漏
- **WHEN** trace audit 检测到 secret、token、完整敏感 payload、内部 capability 或未脱敏 output
- **THEN** 测试 MUST 失败
- **AND** 对应 trace entry MUST 被阻止或标记为不合格

### Requirement: Observation 压缩必须控制模型上下文并保留可校验引用
系统 SHALL 在发送给 `LlmPlanner` 前压缩历史 observation。压缩结果 MUST 保留当前 run 所需的 toolResultId、resource refs、confirmation pendingActionId、policy decision、错误码和安全 summary，不得编造新的业务事实。

#### Scenario: 压缩长 tool 结果
- **WHEN** 多轮 tool result 产生较大的 output 或 observation
- **THEN** observation 压缩 MUST 移除完整 output 和重复 payload
- **AND** 压缩后 MUST 保留后续 action 校验所需的 toolResultId 和 resource refs

#### Scenario: 压缩不改变成功 grounding
- **WHEN** Planner 基于压缩 observation 返回 final_answer
- **THEN** Action Validator MUST 仍能校验 `usedToolResultIds` 和 `usedResourceRefs`
- **AND** 压缩模块 MUST NOT 将 diagnostic resource 改写为 consumable resource

### Requirement: Planner 和 tool budget 必须限制运行成本
系统 SHALL 在 Runtime 中执行 planner call、tool call、repair、token 或等价成本预算。预算耗尽后 Runtime MUST 结构化失败收口，并不得继续调用模型或 tool handler。

#### Scenario: Planner call 预算耗尽
- **WHEN** `LlmPlanner` 调用次数达到 run 配置的 planner budget
- **THEN** Runtime MUST 停止继续调用模型
- **AND** Runtime MUST 返回稳定 budget 类错误或 ask_user / failed 类安全收口

#### Scenario: Tool call 预算耗尽
- **WHEN** tool call 次数达到 run 配置的 tool budget
- **THEN** Runtime MUST NOT 调用后续 tool handler
- **AND** trace / replay 摘要 MUST 记录预算耗尽原因

### Requirement: idempotencyKey 必须进入通用执行上下文
系统 SHALL 为每次 tool execution 生成稳定 `idempotencyKey`，并把它注入 `ToolContext`。相同 pending action 或重复 confirmation resume MUST NOT 导致 fixture write tool 重复执行。

#### Scenario: Tool handler 收到 idempotencyKey
- **WHEN** Executor 调用任意 fixture tool handler
- **THEN** `ToolContext` MUST 包含当前 action 对应的 `idempotencyKey`
- **AND** idempotencyKey MUST 绑定 run、tool name/version、input hash、resource refs 或等价 canonical action 字段

#### Scenario: 重复 confirmation resume 不重复写入
- **WHEN** 同一 pending action 已成功 consumed
- **AND** 用户再次提交相同 pendingActionId 和 actionHash
- **THEN** confirmation resume MUST 拒绝再次执行
- **AND** fixture write tool MUST 证明 handler 未重复产生写入结果

### Requirement: Prompt injection 测试必须覆盖不可信输入边界
系统 SHALL 提供 prompt injection 测试，覆盖用户输入、tool output、resource summary、manifest examples 和 observation 试图绕过策略、泄漏 secret、伪造 confirmation、伪造 resource 或生成任意用户事件的情况。

#### Scenario: Tool output 注入不能绕过策略
- **WHEN** fixture tool output 包含要求模型忽略 policy、直接执行写操作或伪造 confirmation 的文本
- **THEN** DeepSeek 下一轮输出仍 MUST 经过 Action Validator 和 Policy Guard
- **AND** 未确认 write / high risk tool MUST NOT 执行

#### Scenario: 注入文本不能生成任意 event
- **WHEN** 用户输入或 observation 要求模型输出自定义 NDJSON event
- **THEN** `LlmPlanner` MUST 只能产出 `AgentAction`
- **AND** Response Renderer MUST 只输出白名单事件

### Requirement: Contract test helper 必须支撑后续 tool 扩展
系统 SHALL 提供 contract test helper，帮助新增 fixture 或未来业务 tool 验证 defineTool、manifest schema、resource contract、policy、projection、redaction、trace projection 和 renderer 安全边界。

#### Scenario: Fixture tool 使用 contract helper
- **WHEN** M2 fixture tools 通过 contract test helper 验证
- **THEN** helper MUST 检查 tool contract、manifest 安全字段、input/output schema、policy 和 projection
- **AND** 测试 MUST 能证明新增 fixture tool 不需要修改 Runtime、Executor、Policy Guard 或 Response Renderer 主流程

#### Scenario: 不合格 tool contract 被测试捕获
- **WHEN** tool 缺少 description、whenToUse、output schema、policy 或安全 projection
- **THEN** contract test helper MUST 报告失败
- **AND** 该 tool MUST NOT 被当作可上线 tool

### Requirement: Trace / Replay 必须支持脱敏后的真实模型链路回放
系统 SHALL 记录脱敏后的 run trace，使 fixture + DeepSeek 链路可以回放。trace MUST 包含 manifestHash、registry snapshot id、planner action、validation result、policy decision、tool result summary、resource refs、budget event 和 terminal result 的安全摘要。

#### Scenario: DeepSeek fixture run 可回放
- **WHEN** DeepSeek planner 驱动 fixture tools 完成一次 run
- **THEN** trace MUST 记录足以复现该 run 的 planner action、manifestHash、policy decision、tool result summary 和 terminal grounding
- **AND** replay MUST NOT 需要真实业务 tool、数据库数据或未脱敏 payload

#### Scenario: Trace 不含敏感字段
- **WHEN** trace audit 扫描 DeepSeek fixture run
- **THEN** trace MUST NOT 包含 secret、API key、完整 tool output、完整用户敏感 payload、handler 内部对象或 server capability
- **AND** 审计失败时对应测试 MUST 失败

### Requirement: M2 不得注册真实业务 tool
系统 SHALL 继续只使用 fixture tools 验证 M2 上线硬化能力。真实动作库、训练生成、保存、用户记忆、数据库查询或任何 domain tool MUST NOT 在本 change 中新增或注册。

#### Scenario: 架构扫描阻止真实业务 tool
- **WHEN** M2 change 完成实现
- **THEN** 自动化扫描 MUST 证明没有新增 `agent-tools/<domain>` 真实业务目录
- **AND** `agent-tools/index.ts` 或等价注册入口 MUST NOT 注册动作库、训练生成、保存、用户记忆或数据库业务 tool

#### Scenario: Core 没有业务 toolName 分支
- **WHEN** 扫描 `agent-core`、Runtime、Executor、Policy Guard、Action Validator、Response Renderer 和 `/api/chat`
- **THEN** 代码中 MUST 不存在具体业务 toolName 分支
- **AND** `/api/chat` MUST 不存在基于业务关键词的 tool 路由逻辑
