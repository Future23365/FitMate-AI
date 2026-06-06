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

#### Scenario: 生成 Planner manifest
- **WHEN** Runtime 为 Planner 准备可用工具列表
- **THEN** `ToolRegistry` MUST 生成 `ToolManifest[]`
- **AND** manifest MUST 包含 tool name、version、description、whenToUse、whenNotToUse、inputJsonSchema、outputJsonSchema、安全 policy hint 和安全 examples
- **AND** manifest examples MUST 使用完整 `AgentAction` tool_call 形态，例如 `{ "type": "tool_call", "toolName": "<tool name>", "input": { ... } }`
- **AND** manifest examples MUST NOT 只暴露裸 tool input 片段
- **AND** manifest MUST NOT 包含 handler、数据库对象、secret、完整用户 payload 或服务端 capability 对象

#### Scenario: Manifest examples 保持安全和可执行
- **WHEN** tool 声明 examples
- **THEN** 每个 example MUST 包含中文 `description`
- **AND** 每个 example 的 `action.type` MUST 为 `tool_call`
- **AND** 每个 example 的 `action.toolName` MUST 等于该 tool 的真实 `name`
- **AND** 每个 example 的 `action.input` MUST 匹配该 tool 的 `inputSchema`
- **AND** manifest hardening MUST 继续拒绝 prompt-injection-like examples 或暴露 sensitive fields 的 examples

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
系统 SHALL 定义 `AgentAction` Schema，并在执行前校验 `tool_call`、`final_answer` 和 `ask_user` 的结构、引用和可执行边界。`final_answer` 与 `ask_user` SHALL 都使用 `content` 承载用户可见文本；terminal action SHALL 使用统一 `usedRefs` 承载已使用事实来源引用。

#### Scenario: 合法 final_answer terminal action
- **WHEN** Planner 返回 `final_answer`
- **THEN** Action Validator MUST 要求用户可见文本写入 `content`
- **AND** 如果 action 包含 `usedRefs`，validator MUST 校验每个 ref 属于当前 run 的已登记事实来源
- **AND** `usedRefs[type = "tool_result"]` MUST 指向当前 run 中已登记且 `ok = true` 的 tool result
- **AND** `usedRefs[type = "tool_result"]` MAY 指向返回 0 条、候选不足或诊断摘要的成功 tool result，用于支撑普通事实回答
- **AND** `usedRefs[type = "resource"]` MUST 指向当前 run 中已登记且 role / resourceType 满足 terminal grounding 要求的 resource
- **AND** `final_answer` MUST NOT 携带任意 NDJSON event、未登记 resource 或 handler output
- **AND** Action Validator MUST NOT 因 tool result 的业务结果为空、候选不足或中间满足度字段为 false 而拒绝普通 `final_answer`

#### Scenario: 普通 final_answer 可以解释 0 条结果
- **WHEN** 当前 run 中存在 `ok = true` 的只读查询 tool result
- **AND** 该 result 的安全投影表达 `totalMatches = 0` 或等价空结果事实
- **AND** Planner 返回不带 `visibleOutputs` 的 `final_answer`
- **AND** `usedRefs` 引用该 current-run tool result
- **THEN** Action Validator MUST 接受该 terminal action
- **AND** Runtime MAY 渲染普通文本回答说明当前条件下没有匹配数据
- **AND** Runtime MUST NOT 因该 tool result 没有产生业务候选而返回 `terminal_reference_invalid`

### Requirement: Executor 必须通用执行 tool 并归一化结果
系统 SHALL 提供通用 Executor 调用 tool handler，并统一处理输入 Schema、输出 Schema、per-tool timeout、AbortSignal、异常、错误 code 和 `ToolResult` 归一化。

#### Scenario: 执行成功 read fixture tool
- **WHEN** Executor 执行已校验的 read fixture `tool_call`
- **THEN** Executor MUST 调用对应 tool handler
- **AND** handler 输出 MUST 通过 tool 的 `outputSchema`
- **AND** Executor MUST 返回包含 `toolName`、`toolVersion`、`toolResultId`、`ok: true` 和安全 projection 的 `ToolResult`
- **AND** Executor MUST NOT 用候选数量、业务目标完成度或用户语义判断覆盖 `ok`
- **AND** 如果 tool 结果为空或候选不足，该事实 MUST 通过安全 projection、diagnostics 或最终 output validator 表达，而不是通过 core 成功/失败状态表达

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
- **THEN** Runtime MUST 使用该安全投影生成 Planner 可见事实或摘要
- **AND** observation MUST 标注来源为 tool
- **AND** observation MUST NOT 被提升为 system 指令
- **AND** Runtime MUST NOT 因该 projection 表达 0 条结果、候选不足或业务诊断而把 `ok = true` 的 result 排除出普通事实通道

### Requirement: 默认 Response Renderer 必须输出安全 NDJSON 事件
系统 SHALL 提供默认 Response Renderer，将 terminal result、tool result 和标准化错误转换为白名单 NDJSON event，并输出 `done` 收口。

#### Scenario: 渲染 final answer
- **WHEN** Runtime 以合法 `final_answer` 收口
- **THEN** Response Renderer MUST 输出 `content` event
- **AND** Response Renderer MUST 输出 `done` event
- **AND** 用户可见内容 MUST 来自 terminal action 和已校验 current-run refs 的安全投影
- **AND** 如果 `final_answer` 只是解释 0 条或候选不足事实，Response Renderer MUST NOT 因缺少业务候选而改写为 runtime error
- **AND** 如果 `final_answer.visibleOutputs[]` 存在，Response Renderer MUST 只渲染通过对应 terminal output validator 的结构化输出

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

### Requirement: Agent 合同字段必须按语义槽统一
系统 SHALL 在 Agent core 合同中维持语义槽命名一致性：当多个 `AgentAction`、tool input 或 terminal 引用字段承载同一类数据时，它们 MUST 使用同一个字段名，并通过 `type`、`operation`、`kind` 或等价判别字段表达语义差异。

#### Scenario: 同一语义槽不得跨 action 分裂字段
- **WHEN** 两个 terminal action 都需要输出用户可见文本
- **THEN** schema MUST 使用同一个字段名承载该文本
- **AND** action 语义差异 MUST 由 `type` 表达
- **AND** schema MUST NOT 为同一用户可见文本槽同时暴露 `content`、`question`、`message` 或等价并列主字段

#### Scenario: 非同义字段允许保留差异
- **WHEN** 两个字段的数据槽、权限边界、消费方式或校验方式不同
- **THEN** schema MAY 保留不同字段名
- **AND** design MUST 说明这些字段为什么不是同一语义槽
- **AND** 模型可见说明 MUST 避免把它们描述成可互换字段

#### Scenario: 旧同义字段不得作为可用合同继续暴露
- **WHEN** 一个旧字段被收敛到新的统一字段
- **THEN** Agent core MUST NOT 在新生产 schema、prompt 示例、manifest example 或 renderer 主路径中继续暴露旧字段
- **AND** 若模型输出旧字段，validator 或 repair feedback MUST 明确指出新字段形状
- **AND** 服务端 MUST NOT 静默把旧字段转换成新字段作为长期兼容路径

### Requirement: terminal resource_missing 必须提供通用 grounding repair facts
系统 SHALL 在 terminal action 引用不存在的 current-run resource 时，将 `resource_missing` 投影为模型可见的通用 `domain_validation_failed` facts。该 feedback MUST 定位到 `usedRefs.resource.id`，并说明合法恢复来源是当前 run registered `resourceId`、satisfied tool result 或合法 `visibleOutputs`。Agent core MUST NOT 为具体业务 tool、用户短语、业务字段组合或 trace case 写 repair 分支。

#### Scenario: missing resource ref 返回字段级 repair details
- **WHEN** Planner 返回 `final_answer` 或 `ask_user`
- **AND** `usedRefs[]` 中包含 `type = "resource"` 的引用
- **AND** `ResourceStore` 中不存在该 `resourceId`
- **THEN** validator MUST 返回 `code = "resource_missing"`
- **AND** error details MUST 包含 `type = "domain_validation_failed"`
- **AND** details MUST 包含 `target.schemaId = "AgentAction"`
- **AND** details MUST 包含 `facts[]` 项，且 `path = "usedRefs.resource.id"`
- **AND** facts MUST 表达 expected 包括 `current_run_registered_resourceId`、`satisfied_tool_result_ref` 或 `valid_visibleOutputs`
- **AND** facts MUST NOT 包含具体业务 `toolName` 分支、用户自然语言短语、服务端语义改写或跨 run resource 自动导入

#### Scenario: repair feedback 不改变下一轮校验
- **WHEN** 模型收到 `resource_missing` repair facts 后重新输出 action
- **THEN** runtime MUST 继续校验 schema、resource、policy、grounding 和 terminal visible output
- **AND** runtime MUST NOT 因上一轮 feedback 已指出错误而接受未登记 resource
- **AND** runtime MUST NOT 自动把业务对象 id 或历史 message id 转换成 current-run `resourceId`

### Requirement: Runtime PlannerInput 必须区分成功事实通道和修复诊断通道
系统 SHALL 在不改变 `PlannerPort.decideNext(input)` 方法签名、不新增 `PlannerInput` 字段的前提下，收敛当前 `PlannerInput` 中 `observations` 与 `toolResults` 的职责。`toolResults` SHALL 是成功 tool facts 的详细权威通道，`observations` SHALL 主要承载 repair、diagnostic、runtime boundary 和轻量索引。

#### Scenario: Runtime 构造下一轮 PlannerInput
- **WHEN** `runAgentRuntime` 为下一轮 Planner 调用构造 `PlannerInput`
- **THEN** Runtime MUST 继续传入 `run`、`step`、`manifests`、`observations` 和 `toolResults`
- **AND** Runtime MUST NOT 新增 `PlannerInput` 字段
- **AND** Runtime MUST 保持 `PlannerPort.decideNext(input)` 方法签名兼容
- **AND** Runtime MUST 确保成功 tool result 的详细模型可见事实不在 `observations` 和 `toolResults` 中重复出现
- **AND** Runtime MUST 保持 invalid action、duplicate success、failed tool、runtime error 等 repair / diagnostic observation 的可见性

#### Scenario: 新增业务 tool 不需要修改核心去重逻辑
- **WHEN** 后续新增或注册业务 tool
- **THEN** 该 tool 只要通过现有 `projection.model`、fulfillment、observation helper 和结构化 validator / resource facts 输出安全投影
- **AND** Runtime PlannerInput 去重 MUST 对该 tool 自动生效
- **AND** Runtime MUST NOT 新增基于具体业务 `toolName` 的分支来决定是否去重

#### Scenario: ReplayPlanner 测试可断言输入边界
- **WHEN** `ReplayPlanner` 或等价测试 Planner 记录每轮 Planner input
- **THEN** 测试 MUST 能断言成功 tool result 的详细 facts 只出现在权威通道
- **AND** 测试 MUST 能断言 repair / diagnostic observation 仍进入下一轮 input
- **AND** 测试 MUST NOT 依赖用户原文关键词或具体业务 phrasing 判断去重是否生效

### Requirement: Model observation 不得承载业务决策提示
系统 SHALL 将 `toModelObservation`、ok tool result index observation 或等价 model projection 限定为安全事实摘要。正常 model observation MUST NOT 替 Planner 判断用户目标是否满足、最终 `visibleOutputs` 是否应成功交付、应输出哪个业务 `payload.kind`，或下一步应选择哪个 action 类型。

#### Scenario: 成功 tool result 只投影事实
- **WHEN** tool result 被转换成 Planner 可见 observation
- **THEN** observation MAY 包含 tool 执行状态、引用 id、事实等级、有限事实摘要、资源引用、缺口字段和诊断 code
- **AND** observation MUST NOT 包含 `supportsOutputKinds`
- **AND** observation MUST NOT 包含 `supportsSuccessfulVisibleOutputs`
- **AND** observation MUST NOT 包含 `finalAnswerSupport`
- **AND** observation MUST NOT 包含 `nextActionHints`
- **AND** observation MUST NOT 使用等价字段表达“当前结果支持输出哪些业务 kind”或“下一步应该 final answer / 继续 tool / ask user”

#### Scenario: 用户目标满足度只由终态合同决定
- **WHEN** Planner 基于 tool observations 返回 `final_answer`
- **THEN** Action Validator、terminal output validator 和 business validator MUST 基于 schema、事实引用、resource、权限和可渲染性做确定性校验
- **AND** Runtime MUST NOT 基于中间 observation 中的业务满足度字段接受或拒绝成功结构化输出
- **AND** tool observation MUST NOT 通过自定义字段绕回用户目标是否已满足的判断

#### Scenario: 事实缺口以确定性字段表达
- **WHEN** tool result 缺少某些后续业务输出可能需要的事实
- **THEN** observation MAY 表达确定性缺口字段，例如 `missingSections`、`diagnostics[]`、`querySpecificity`、`hasSchedule` 或等价事实
- **AND** observation MUST NOT 把这些缺口派生成可输出 kind 列表、下一步 action 建议或固定 tool flow

#### Scenario: repairContext 只表达字段级修复事实
- **WHEN** Planner 输出非法 action、重复 tool input 或不满足 schema / domain validator 的结果，并进入 `repairContext`
- **THEN** `repairContext` MAY 表达错误 code、字段路径、expected、actual、allowedFields、requiredFields、allowedValues、previous tool result fact 和可恢复边界
- **AND** `repairContext` MUST NOT 包含 `nextActionHints`
- **AND** `repairContext` MUST NOT 包含 `final_answer_with_visible_outputs`、`final_answer_without_visible_outputs`、`final_answer_with_current_tool_result`、`continue_tool_call`、`ask_user` 或等价下一步 action 枚举
- **AND** `repairContext` MUST NOT 让服务端根据用户自然语言、具体 phrasing 或具体业务 `toolName` 改写下一轮 action

