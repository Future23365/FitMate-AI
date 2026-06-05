# agent-tool-safety-resource-closure Specification

## Purpose
TBD - created by archiving change add-agent-tool-safety-resource-closure-m1. Update Purpose after archive.
## Requirements
### Requirement: ResourceStore 必须登记当前 run 内资源
系统 SHALL 提供 `ResourceStore` 或等价模块，作为 tool 间传递资源事实的唯一依据。所有可被后续 action 引用的资源 MUST 先登记到当前 run 的 store 中，并带有 type、resource id、role、runId、sourceToolResultId、schemaVersion 或等价可追踪字段。

#### Scenario: Producer 登记 consumable resource
- **WHEN** resource producer fixture 成功执行并声明产出 `consumable` resource
- **THEN** Runtime MUST 将该 resource 登记到当前 run 的 `ResourceStore`
- **AND** 登记记录 MUST 绑定当前 `runId` 和 producer 的 `toolResultId`
- **AND** 后续 Planner 只能通过已登记 resource ref 引用该资源

#### Scenario: 拒绝跨 run resource
- **WHEN** Planner 在当前 run 中引用另一个 run 产生的 resource ref
- **THEN** Action Validator MUST 拒绝该 action
- **AND** Runtime MUST NOT 调用 downstream tool handler
- **AND** 错误 MUST 使用稳定 resource 类 code

#### Scenario: 未登记 resource 不可消费
- **WHEN** Planner 引用不存在于当前 `ResourceStore` 的 resource ref
- **THEN** Action Validator MUST 拒绝该 action
- **AND** Runtime MUST 生成可测试的 invalid resource observation 或 terminal error
- **AND** 系统 MUST NOT 把该 resource ref 当作成功事实

### Requirement: Resource Contract Validator 必须校验 requires 和 produces
系统 SHALL 为 tool 提供 `resourceContract` 或等价合同，描述 tool 需要消费和会产出的 resource type / role。Runtime MUST 在执行前校验 consumed resources，在执行后校验 produced resources。

#### Scenario: Consumer 消费满足合同的 consumable resource
- **WHEN** resource consumer fixture 声明需要某类 `consumable` resource
- **AND** Planner 的 `tool_call.consumes` 引用当前 run 中已登记且类型匹配的 `consumable` resource
- **THEN** Action Validator MUST 接受该 action
- **AND** Runtime MUST 允许 Executor 调用 consumer handler
- **AND** ToolResult MUST 记录 consumed resource ref

#### Scenario: Consumer 缺少必需 resource
- **WHEN** resource consumer fixture 声明必需 resource
- **AND** Planner 未提供满足合同的 `tool_call.consumes`
- **THEN** Action Validator MUST 拒绝该 action
- **AND** Runtime MUST NOT 调用 consumer handler
- **AND** 错误 MUST 表示 resource requirement unmet

#### Scenario: Producer 产出未声明 resource
- **WHEN** tool handler 返回或声明 produced resource
- **AND** produced resource 的 type 或 role 不符合该 tool 的 `resourceContract.produces`
- **THEN** Resource Contract Validator MUST 拒绝登记该 resource
- **AND** Runtime MUST 将本次 tool result 标记为合同失败或 diagnostic 失败
- **AND** 下游 tool MUST NOT 消费该 resource

#### Scenario: Diagnostic resource 不满足 consumed requirement
- **WHEN** Planner 让 downstream tool 消费 role 为 `diagnostic` 的 resource
- **THEN** Action Validator MUST 拒绝该 action
- **AND** Runtime MUST NOT 调用 downstream tool handler
- **AND** diagnostic resource MUST 只能用于解释、阻断、失败证据或调试

### Requirement: Terminal action 必须按资源角色做 grounding 校验
系统 SHALL 在 `final_answer` 和 `ask_user` 收口前校验 `usedResourceRefs`。成功性终止回答 MUST 只引用当前 run 中已登记的 `consumable` resource；诊断资源不得被包装为成功业务结果。

#### Scenario: Final answer 引用 consumable resource
- **WHEN** Planner 返回 `final_answer`
- **AND** `usedResourceRefs` 只包含当前 run 中已登记的 `consumable` resource
- **THEN** Action Validator MUST 接受该 terminal action
- **AND** Response Renderer MUST 基于 terminal content 和安全 user projection 输出用户可见事件

#### Scenario: Final answer 引用 diagnostic resource
- **WHEN** Planner 返回 `final_answer`
- **AND** `usedResourceRefs` 包含 role 为 `diagnostic` 的 resource
- **THEN** Action Validator MUST 拒绝该 terminal action
- **AND** Runtime MUST NOT 把 diagnostic failure 伪装为成功完成
- **AND** 错误 MUST 能说明 final grounding 使用了非法诊断资源

#### Scenario: Ask user 引用 diagnostic resource 说明阻断原因
- **WHEN** Planner 返回 `ask_user`
- **AND** `usedResourceRefs` 包含当前 run 的 diagnostic resource
- **THEN** Action Validator MUST 接受该引用作为澄清或阻断证据
- **AND** Response Renderer MUST NOT 将该 diagnostic resource 输出为成功 tool result
- **AND** 用户可见内容 MUST 只来自 terminal question 和安全投影

### Requirement: Policy Guard 必须在 Executor 前裁决 tool_call
系统 SHALL 在执行任何 `tool_call` handler 前调用 `Policy Guard`。`Policy Guard` MUST 基于 actor、tool policy、permissions、riskLevel、sideEffect、confirmation 策略、resource refs 和结构化 input 做确定性裁决，并返回 allow、deny 或 requires_confirmation。

#### Scenario: 低风险只读 tool 被允许执行
- **WHEN** Planner 请求执行 `sideEffect = "read"`、`riskLevel = "low"`、`confirmation = "never"` 的 tool
- **AND** actor 满足 tool 所需 permissions
- **THEN** `Policy Guard` MUST 返回 allow
- **AND** Runtime MUST 允许 Executor 继续执行该 action

#### Scenario: 权限不足时拒绝执行
- **WHEN** Planner 请求执行需要特定 permission 的 tool
- **AND** actor 不具备该 permission
- **THEN** `Policy Guard` MUST 返回 deny
- **AND** Runtime MUST NOT 调用 tool handler
- **AND** Runtime MUST 返回结构化 unauthorized 或 policy denied 错误

#### Scenario: 写操作需要 confirmation
- **WHEN** Planner 请求执行 `sideEffect = "write"`、`riskLevel = "high"` 或 `confirmation` 要求确认的 tool
- **THEN** `Policy Guard` MUST 返回 requires_confirmation
- **AND** Runtime MUST NOT 调用 tool handler
- **AND** Response Renderer MUST 能输出 confirmation request 白名单事件或等价安全结果

#### Scenario: Policy Guard 不读取用户自然语言做语义分流
- **WHEN** `Policy Guard` 评估任意 action
- **THEN** `Policy Guard` MUST NOT 基于用户原文关键词、正则、同义词表或模板判断业务意图
- **AND** `Policy Guard` MUST 只根据结构化 action、tool contract、actor、permissions、resource 和 policy metadata 做确定性裁决

### Requirement: Confirmation pending action 和 action hash 必须由服务端生成
系统 SHALL 在 `Policy Guard` 返回 requires_confirmation 时创建 `PendingAction`，并由服务端生成 `pendingActionId` 和 `actionHash`。Planner、客户端和 tool handler MUST NOT 生成或覆盖 confirmation hash。

#### Scenario: 创建 pending action
- **WHEN** confirmation write fixture 被 `Policy Guard` 判定为 requires_confirmation
- **THEN** Runtime MUST 保存包含原始 `tool_call`、runId、actor、toolName、toolVersion、input hash、resource refs、expiresAt 和 status 的 pending action
- **AND** Runtime MUST 生成服务端 `actionHash`
- **AND** Runtime MUST 返回 confirmation request 结果而不执行 write handler

#### Scenario: Planner 输出 request_confirmation 被拒绝
- **WHEN** Planner 输出 `{ type: "request_confirmation" }` 或携带自造 confirmation hash 的 action
- **THEN** Action Validator MUST 拒绝该 action
- **AND** Runtime MUST NOT 使用 Planner 提供的 pendingActionId 或 actionHash
- **AND** 错误 MUST 表示 confirmation 只能由服务端策略生成

#### Scenario: Action hash 绑定 canonical action
- **WHEN** 服务端生成 `actionHash`
- **THEN** hash MUST 绑定 runId、actor、toolName、toolVersion、input hash、resource refs、policy version 和 expiresAt 或等价字段
- **AND** 任一绑定字段变化后旧 hash MUST 校验失败

### Requirement: Confirmation resume 必须执行服务端保存的 pending action
系统 SHALL 提供 confirmation resume 的 core 能力。resume 输入只能包含 pendingActionId、actionHash 和调用主体上下文；执行时 MUST 读取服务端保存的 pending action，不得信任客户端或 LLM 重新传入的新 input。

#### Scenario: 合法 confirmation resume 执行保存 action
- **WHEN** 用户确认未过期、状态为 pending 且 hash 正确的 pending action
- **THEN** confirmation resume MUST 读取服务端保存的 `tool_call`
- **AND** Runtime MUST 在重新通过 Policy Guard / Resource Contract 必要校验后调用 Executor
- **AND** 成功执行后 pending action MUST 标记为 consumed

#### Scenario: Resume 时客户端传入不同 input
- **WHEN** confirmation resume 请求携带与 pending action 不同的新 input 或 resource refs
- **THEN** 系统 MUST 忽略或拒绝这些客户端字段
- **AND** Executor MUST NOT 执行客户端新传入的 action
- **AND** 测试 MUST 能证明执行的是服务端保存的 pending action

#### Scenario: 过期或已消费 pending action 不可执行
- **WHEN** pending action 已过期、已 consumed、已 confirmed 后重复提交或状态非法
- **THEN** confirmation resume MUST 拒绝执行
- **AND** Runtime MUST NOT 再次调用 write handler
- **AND** 错误 MUST 使用稳定 confirmation 类 code

### Requirement: Tool output 和 resource summary 必须通过安全投影进入模型、用户和 trace fixture
系统 SHALL 继续禁止完整 tool output 默认进入 Planner、用户事件或 trace fixture。M1 新增的 resource summary、policy decision 和 confirmation result MUST 只通过安全 projection / summary 暴露。

#### Scenario: Resource summary 进入 Planner observation
- **WHEN** producer tool 成功产出 consumable resource
- **THEN** Planner observation MUST 只包含资源类型、resource ref、安全 summary 和必要 fulfillment 信息
- **AND** observation MUST NOT 包含完整 handler output、secret、数据库对象或未脱敏 payload

#### Scenario: Confirmation request 进入用户事件
- **WHEN** Runtime 返回 confirmation request
- **THEN** Response Renderer MUST 输出白名单 confirmation request 事件或等价安全响应
- **AND** 用户事件 MUST 包含 pendingActionId、actionHash、expiresAt 和安全 message
- **AND** 用户事件 MUST NOT 包含完整 tool input、secret 或 handler 内部对象

#### Scenario: Diagnostic failure 进入 trace fixture
- **WHEN** diagnostic failure fixture 返回失败结果
- **THEN** trace / replay fixture MUST 只记录失败 code、toolResultId、resource role 和安全摘要
- **AND** trace / replay fixture MUST NOT 记录完整敏感 output 或服务端 secret

### Requirement: Diagnostic failure 不得被伪装为成功结果
系统 SHALL 将失败 tool result、`satisfied = false` 的结果或 diagnostic resource 视为诊断证据，而不是成功业务事实。Response Renderer 和 terminal grounding MUST 保持该区分。

#### Scenario: Diagnostic failure fixture 产生 diagnostic resource
- **WHEN** diagnostic failure fixture 返回失败或未满足结果
- **THEN** Runtime MUST 将对应 resource 登记为 diagnostic 或记录为 diagnostic evidence
- **AND** 下游 consumer MUST NOT 消费该 resource
- **AND** final answer MUST NOT 将其作为成功依据

#### Scenario: 用户可见失败解释引用 diagnostic
- **WHEN** Runtime 以 ask_user、failed、blocked 或等价非成功结果收口
- **AND** 结果引用 diagnostic failure evidence
- **THEN** Response Renderer MUST 使用安全摘要解释失败或需要澄清的原因
- **AND** Response Renderer MUST NOT 输出表示资源已成功生产或写入完成的事件

### Requirement: M1 fixture tools 必须证明新增能力不改 core 主流程
系统 SHALL 新增 M1 fixture tools，覆盖 resource producer、resource consumer、confirmation write、diagnostic failure 和 replay/trace fixture。新增 fixture tool MUST 只通过 tool contract 注册，不得要求修改 Runtime、Executor、Policy Guard、Resource Contract Validator、Response Renderer 或 `/api/chat` 的业务分支。

#### Scenario: 注册 producer 和 consumer fixture
- **WHEN** 新增并注册 resource producer / consumer fixture tools
- **THEN** ToolRegistry MUST 能将它们暴露到 manifest
- **AND** Runtime MUST 能通过 ReplayPlanner 执行 producer 到 consumer 的资源链路
- **AND** core 主循环 MUST NOT 出现具体 fixture toolName 分支

#### Scenario: 注册 confirmation write fixture
- **WHEN** 新增并注册 confirmation write fixture tool
- **THEN** Runtime MUST 通过通用 Policy Guard 生成 confirmation request
- **AND** confirmation resume MUST 通过通用 Executor 执行保存的 pending action
- **AND** core 主流程 MUST NOT 为该 fixture 增加 toolName 特判

#### Scenario: 架构扫描防止生产接入
- **WHEN** M1 change 完成实现
- **THEN** 自动化检查 MUST 证明 production `/api/chat` 未接入 M1 fixture runtime
- **AND** M1 MUST NOT 注册真实业务 tool、真实 LLM adapter 或旧 `lib/server/agent-orchestrator/**`

### Requirement: Trace / Replay fixture 必须复现 M1 安全链路
系统 SHALL 为 M1 提供 replay/trace fixture 或等价测试摘要，记录资源登记、资源消费、Policy Guard 决策、confirmation request/resume、tool result 和 terminal grounding，使安全链路可以在不调用真实 LLM 和真实业务依赖的情况下复现。

#### Scenario: Replay 复现资源链路
- **WHEN** ReplayPlanner 依次输出 producer、consumer 和 final answer
- **THEN** replay/trace fixture MUST 记录 producer resource registration
- **AND** replay/trace fixture MUST 记录 consumer consumed resource ref
- **AND** 测试 MUST 能断言 final answer 引用了当前 run 的 consumable resource

#### Scenario: Replay 复现 confirmation 链路
- **WHEN** ReplayPlanner 输出 confirmation write fixture action
- **THEN** replay/trace fixture MUST 记录 policy decision requires_confirmation
- **AND** confirmation resume 后 MUST 记录 pending action consumed 和 write tool result
- **AND** 复现过程 MUST NOT 调用真实模型或真实业务依赖

### Requirement: 工具执行后的成功 final_answer 必须具备当前 run grounding
系统 SHALL 在 `final_answer` 收口前校验当前 run grounding。当当前 run 已经产生 tool result 时，成功 `final_answer` MUST 至少通过 `usedToolResultIds`、`usedResourceRefs` 或 `visibleOutputs[]` 之一连接到当前 run 中可校验的已满足事实。系统 MUST NOT 把工具执行后的无引用、无结构输出 `final_answer` 当作成功完成。

#### Scenario: 拒绝工具执行后的空 grounding final_answer
- **WHEN** 当前 run 已经存在至少一个 tool result
- **AND** Planner 返回 `final_answer`
- **AND** `usedToolResultIds` 为空或缺失
- **AND** `usedResourceRefs` 为空或缺失
- **AND** `visibleOutputs[]` 为空或缺失
- **THEN** Action Validator MUST 拒绝该 terminal action
- **AND** Runtime MUST NOT 将该 `final_answer.content` 投影为成功用户回复
- **AND** 错误 MUST 使用稳定 terminal grounding 类 code

#### Scenario: 允许引用已满足 tool result 的 final_answer
- **WHEN** 当前 run 已经存在 tool result
- **AND** Planner 返回 `final_answer`
- **AND** `usedToolResultIds` 引用当前 run 中 `ok = true` 且 `fulfillment.satisfied = true` 的 tool result
- **THEN** Action Validator MUST 接受该 grounding
- **AND** Response Renderer MAY 投影该 `final_answer.content`

#### Scenario: 允许引用 consumable resource 的 final_answer
- **WHEN** 当前 run 已经存在 tool result
- **AND** Planner 返回 `final_answer`
- **AND** `usedResourceRefs` 引用当前 run 中已登记且 role 为 `consumable` 的 resource
- **THEN** Action Validator MUST 接受该 grounding
- **AND** Action Validator MUST 继续拒绝 diagnostic resource 支撑成功 `final_answer`

#### Scenario: 允许带合法 visibleOutputs 的 final_answer
- **WHEN** 当前 run 已经存在 tool result
- **AND** Planner 返回 `final_answer`
- **AND** `visibleOutputs[]` 非空
- **THEN** Action Validator MUST 将每个 visible output 交给对应 terminal output validator
- **AND** 只有 visible output 校验通过时 Runtime MAY 成功收口

#### Scenario: 普通无 tool 聊天不要求 grounding
- **WHEN** 当前 run 没有 tool result
- **AND** Planner 返回普通自然语言 `final_answer`
- **THEN** Action Validator MUST NOT 仅因缺少 `usedToolResultIds`、`usedResourceRefs` 或 `visibleOutputs[]` 拒绝该 action
- **AND** 普通聊天、能力说明、训练原则解释仍可由模型直接收口

### Requirement: final_answer 不能表达未执行的后续 tool 承诺
系统 SHALL 将 `final_answer` 视为当前 run 的终态动作。模型和 validator 的合同 MUST 表达：如果还需要执行工具、查询事实、生成结构、保存结果或等待后续内部动作，Planner MUST 返回合法 `tool_call`、`ask_user` 或失败收口，而不是用成功 `final_answer.content` 承诺“稍后继续”。

#### Scenario: 需要继续工具时返回 tool_call
- **WHEN** Planner 判断当前回答仍需要当前 run 中尚未执行的 tool 事实
- **THEN** Planner MUST 返回 `tool_call`
- **AND** Planner MUST NOT 返回成功 `final_answer` 来描述尚未执行的 tool 操作

#### Scenario: 无法继续工具时明确阻断
- **WHEN** 当前可见 tool、事实或用户约束不足以完成目标
- **THEN** Planner MUST 使用 `ask_user` 澄清，或使用不伪造成功事实的失败说明收口
- **AND** Planner MUST NOT 将未完成的内部步骤描述为已经进入等待状态

