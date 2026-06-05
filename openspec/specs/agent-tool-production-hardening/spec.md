# agent-tool-production-hardening Specification

## Purpose
TBD - created by archiving change add-agent-tool-production-hardening-m2. Update Purpose after archive.
## Requirements
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

#### Scenario: final_answer 不得引用未满足 tool result 作为成功依据
- **WHEN** Planner 返回 final_answer 并通过 `usedToolResultIds` 引用 failed 或 `fulfillment.satisfied=false` 的 tool result
- **THEN** Action Validator MUST 将该 terminal action 判定为 `terminal_reference_invalid`
- **AND** ask_user MAY 引用未满足或诊断性 tool result 用于解释阻断或追问

### Requirement: Planner 和 tool budget 必须限制运行成本
系统 SHALL 在 Runtime 中执行 planner call、tool call、repair、token 或等价成本预算。预算耗尽后 Runtime MUST 结构化失败收口，并不得继续调用模型或 tool handler。Production `/api/chat` 的低风险只读 Agent 链路 MUST 支持多 tool 调用，不得将总 tool 调用预算固定为 1。

#### Scenario: Production 文本聊天允许低风险多 tool 链路
- **WHEN** production `/api/chat` 构造 Agent run limits
- **THEN** `maxToolCalls` MUST 设置为 10
- **AND** `maxPlannerCalls` 和 `maxSteps` MUST 与 10 次 tool 调用加一次 terminal action 的最坏路径匹配，不能低于完成该链路所需的 planner / step 上限
- **AND** 该预算放宽 MUST 只改变总运行预算，不得绕过 Action Validator、Policy Guard、Resource Contract Validator、ResourceStore 或 Response Renderer

#### Scenario: Planner call 预算耗尽
- **WHEN** `LlmPlanner` 调用次数达到 run 配置的 planner budget
- **THEN** Runtime MUST 停止继续调用模型
- **AND** Runtime MUST 返回稳定 budget 类错误或 ask_user / failed 类安全收口

#### Scenario: Tool call 预算耗尽
- **WHEN** tool call 次数达到 run 配置的 tool budget
- **THEN** Runtime MUST NOT 调用后续 tool handler
- **AND** trace / replay 摘要 MUST 记录预算耗尽原因

#### Scenario: 重复 tool 调用不能被预算放宽掩盖
- **WHEN** Planner 在同一 run 中重复请求相同 toolName、相同 toolVersion 和相同归一化 input
- **THEN** trace / replay MUST 能记录重复调用摘要
- **AND** 系统 SHOULD 在结构化 observation、duplicate failure 或等价安全边界中提示 Planner 收口或调整输入
- **AND** 系统 MUST NOT 通过提高 tool 预算把重复空转伪装成成功刷新

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

### Requirement: 事实查询 tool 可以将 0 条结果声明为满足的成功结果
系统 SHALL 允许只读事实查询 tool 在查询执行成功且返回 0 条业务记录时声明 `fulfillment.satisfied = true`，前提是该结果表达的是已完成事实查询，而不是候选消费、写入或生成任务完成。

#### Scenario: 0 条事实查询可以支撑 final_answer
- **WHEN** Planner 返回 `final_answer`
- **AND** `usedToolResultIds` 引用当前 run 中 `ok = true` 且 `fulfillment.satisfied = true` 的事实查询 tool result
- **AND** 该 tool result 的业务摘要包含 `totalMatches = 0`
- **THEN** Action Validator MUST 按通用 grounding 规则允许该引用
- **AND** Runtime MUST NOT 因业务记录数量为 0 而将该 terminal action 改写成 `terminal_reference_invalid`

#### Scenario: 通用 unsatisfied grounding 规则保持不变
- **WHEN** Planner 返回 `final_answer`
- **AND** `usedToolResultIds` 引用 failed、diagnostic 或 `fulfillment.satisfied = false` 的 tool result
- **THEN** Action Validator MUST 继续将该 terminal action 判定为 `terminal_reference_invalid`
- **AND** 本规则 MUST NOT 为单个业务 tool 增加 Action Validator 特判

### Requirement: 候选消费不足不能伪装成事实查询成功
系统 SHALL 保持事实查询成功与下游候选消费满足之间的边界。只读查询 tool 的 `satisfied = true` 只表示查询事实已完成，不表示训练生成、推荐候选或保存操作已满足。

#### Scenario: 空查询结果不自动生成 consumable candidate resource
- **WHEN** `searchExerciseResources` 或等价只读查询 tool 返回 `totalMatches = 0`
- **THEN** Runtime MUST NOT 自动登记 `candidate_set`、routine、plan、patch、artifact revision 或等价可消费生成资源
- **AND** 下游生成或保存 tool MUST 继续依赖自己的输入 schema、resource contract 和领域校验

#### Scenario: 不在 core 内写业务 toolName 分支
- **WHEN** Runtime、Action Validator、Executor、Policy Guard、ResourceStore、Resource Contract Validator 或 Response Renderer 处理 0 条事实查询 result
- **THEN** 这些 core 模块 MUST NOT 新增基于 `searchExerciseResources` 或其他具体业务 `toolName` 的特判
- **AND** 0 条事实查询的语义 MUST 由该 tool 的 output、fulfillment 和模型可见说明表达

### Requirement: 模型可见 tool 合同必须区分 input 字段和 output-only 字段
系统 SHALL 确保 production tool manifest、schema summary、examples 和 Planner observation 明确区分可传入 input 字段与 output-only 摘要字段，避免模型把服务端输出统计、截断状态或内部上限误当成下一轮 tool input。

#### Scenario: output-only 字段不得出现在 input schema 或 examples
- **WHEN** 系统构造 production tool manifest
- **THEN** manifest 的 `inputJsonSchema` MUST 只包含该 tool 真实允许的 input 字段
- **AND** manifest examples MUST NOT 把 output-only 字段放进 input 示例
- **AND** manifest / schema summary MUST NOT 暗示 output-only 字段可以由 Planner 传入

#### Scenario: observation 不暴露可复制的内部上限字段
- **WHEN** tool result 被投影成 Planner 可见 observation
- **THEN** observation MUST 使用安全投影或默认摘要
- **AND** 服务端内部上限、分页控制或 output-only 统计字段 MUST 被移除，或被明确标注为 output summary
- **AND** observation MUST NOT 包含可被模型直接复制成下一轮 input 的分页控制片段

#### Scenario: 嵌套 observation 不得泄漏 output-only 字段
- **WHEN** tool result observation 包含上游 query、历史 fact、摘要对象或嵌套 payload
- **THEN** 嵌套对象中的 output-only 字段 MUST 同样被移除或明确标注为 output summary
- **AND** `maxReturned`、`limit`、`take`、`offset`、`page`、`pageSize` MUST NOT 通过嵌套 `query` 或历史 fact 重新暴露成可复制 input
- **AND** observation MUST 保留下一步决策需要的安全摘要，而不是回灌完整 handler output

#### Scenario: 搜索动作资源工具不得开放分页控制 input
- **WHEN** `searchExerciseResources` 或等价只读动作资源查询 tool 暴露给 production Planner
- **THEN** 其模型可见 input 合同 MUST NOT 包含 `maxReturned`、`limit`、`take`、`offset`、`page` 或 `pageSize`
- **AND** Action Validator MUST 继续拒绝这些未知或不允许字段
- **AND** 服务端内部固定返回上限 MUST 只作为执行和输出摘要边界，不得变成 LLM 可控查询能力

#### Scenario: 成功 tool result 的 final grounding 说明清晰
- **WHEN** tool result 满足 `ok = true` 且 `fulfillment.satisfied = true`
- **THEN** 模型可见合同 MUST 说明该结果可以通过 `final_answer.usedToolResultIds` 支撑成功回答
- **AND** failed、diagnostic 或 `satisfied=false` 的结果 MUST 继续只能用于解释、澄清、阻断说明或 repair

#### Scenario: 成功 tool result 的下一步状态迁移说明清晰
- **WHEN** tool result 满足 `ok = true` 且 `fulfillment.satisfied = true`
- **AND** 该 tool result 已为当前 run 提供后续可用事实、resource 或候选结果
- **THEN** 模型可见 observation MUST 说明后续应基于既有 `toolResultId`、resource ref 或安全摘要继续决策
- **AND** observation MUST NOT 暗示 Planner 需要再次用相同 input 调用同一 tool 才能取得同一事实

### Requirement: Tool manifest 描述字段必须具备中文说明
系统 SHALL 在 tool manifest hardening 或等价 registry manifest 测试中检查 Planner 可见描述性字段，防止英文说明作为默认 prompt 暴露给模型。

#### Scenario: 序列化 Planner manifest
- **WHEN** `ToolRegistry` 序列化可进入 Planner 的 tool manifest
- **THEN** manifest 顶层 `description`、`whenToUse`、`whenNotToUse` 和 `examples.description` MUST 包含中文说明
- **AND** input / output JSON Schema 中的 `description` MUST 包含中文说明
- **AND** manifest linter 或回归测试 MUST 允许字段名、enum、resource type、toolName、schema id 和示例 input 中的结构化值保持英文

#### Scenario: 描述字段缺少中文说明
- **WHEN** tool manifest 的描述性字段完全没有中文说明
- **THEN** manifest hardening MUST 报告不合格或相关 registry manifest 测试 MUST 失败
- **AND** 不合格 manifest MUST NOT 被视为符合生产模型可见合同

### Requirement: Terminal output validation 不得硬编码业务 toolName
系统 SHALL 保持 terminal output validation 的通用边界：core validator / renderer / ResourceStore / Response Renderer 不得通过具体业务 `toolName` 白名单决定最终用户可见结构化输出是否合法。业务输出合法性 MUST 由 outputType 对应的 validator、数据库事实、权限和资源合同共同校验。

#### Scenario: 结构化输出校验不认具体 toolName
- **WHEN** Runtime 校验 `final_answer.visibleOutputs[]`
- **THEN** terminal output validation MUST 根据 `outputType` 分发到对应 validator
- **AND** 通用 core MUST NOT 包含 `searchExerciseResources`、`inspectVisibleTrainingProposals` 或其他具体业务 toolName 分支来决定 terminal output 是否可渲染
- **AND** 业务 validator MUST NOT 要求新增 tool 时同步添加 toolName 白名单

#### Scenario: 新增业务 tool 不修改 terminal output core
- **WHEN** 后续新增动作查询、动作详情、候选推荐或训练辅助 tool
- **AND** 该 tool 不改变 `AgentAction` 或 `visibleOutputs[]` envelope
- **THEN** 系统 MUST NOT 要求修改 `PlannerPort`、Executor 主流程、Policy Guard、Resource Contract Validator、Response Renderer 主流程或 terminal output core 才能让最终输出完成校验

#### Scenario: 业务 validator 通过注入边界读取事实
- **WHEN** 某个 `outputType` 的 validator 需要数据库、权限或领域事实完成校验
- **THEN** 该 validator MUST 通过生产装配层注入的服务或 validator context 读取事实
- **AND** `agent-core` MUST NOT 直接导入 Prisma、业务 repository 或具体业务 tool 模块
- **AND** 测试 MUST 证明替换或新增业务 tool 不需要修改 core validator 分发逻辑

### Requirement: 无 grounding 的 terminal completion 必须进入 repair 或安全失败收口
生产 Agent runtime SHALL 将工具执行后的无 grounding `final_answer` 视为 invalid terminal completion。系统 MUST 生成结构化 observation 供 Planner repair；当 repair budget 耗尽时，production adapter MUST 输出安全失败收口，而不是把内部错误或未完成承诺直接展示给用户。

#### Scenario: invalid terminal completion 进入 repair
- **WHEN** Planner 在 tool result 已存在后返回无 `usedToolResultIds`、无 `usedResourceRefs` 且无 `visibleOutputs[]` 的 `final_answer`
- **THEN** Runtime MUST 记录 validation failure
- **AND** Runtime MUST 将可恢复 repair feedback 放入下一轮 Planner 可见 observations
- **AND** repair feedback MUST 说明合法选择包括继续 `tool_call`、引用已满足 tool result/resource、输出合法 `visibleOutputs[]`、`ask_user` 澄清或明确失败收口

#### Scenario: repair 后可以继续 tool_call
- **WHEN** Runtime 因 invalid terminal completion 触发 repair
- **AND** Planner 下一轮返回合法 `tool_call`
- **THEN** Runtime MUST 允许该 tool_call 继续经过 Action Validator、Policy Guard 和 Executor
- **AND** 系统 MUST NOT 因上一轮 terminal completion 失败而跳过正常 tool 执行边界

#### Scenario: repair budget 耗尽时安全收口
- **WHEN** Planner 在 repair 后仍重复提交 invalid terminal completion
- **THEN** Runtime MUST 按 repair budget 失败收口
- **AND** production adapter MUST NOT 渲染任一被 validator 拒绝的 `final_answer.content`
- **AND** 用户可见 fallback MUST 使用安全中文说明，不暴露 stack、provider raw error 或内部 handler payload

#### Scenario: 生产接入不新增语义分流
- **WHEN** 实现 invalid terminal completion hardening
- **THEN** `/api/chat` 主链路 MUST NOT 新增基于用户原文、assistant 正文、关键词、正则、同义词表、短句模板或具体 phrasing 的分流
- **AND** Agent core MUST NOT 新增具体业务 `toolName` 语义分支

