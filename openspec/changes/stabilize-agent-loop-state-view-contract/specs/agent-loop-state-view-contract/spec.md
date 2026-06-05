## ADDED Requirements

### Requirement: Agent Loop 必须分离内部状态与模型可见状态视图
系统 SHALL 在每个 loop turn 中维护完整 `AgentLoopState`，并从中构造唯一权威的 `PlannerStateView` 作为 Planner 模型可见输入。`PlannerStateView` SHALL 是模型判断下一步 action 的唯一状态载体，避免同一 tool fact 同时以多个互相竞争的通道传入。

#### Scenario: 构造 Planner 输入
- **WHEN** Runtime 准备调用 Planner
- **THEN** 系统 MUST 先更新内部 `AgentLoopState`
- **AND** 系统 MUST 从 `AgentLoopState` 派生 `PlannerStateView`
- **AND** Planner 输入 MUST 只包含 `PlannerStateView`、当前 tool manifest 和受控模型指令
- **AND** Planner 输入 MUST NOT 并行传入完整内部 runtime state、完整 handler output、完整 `ToolResult.projection.model` 或重复权威的 raw `observations`

#### Scenario: 多轮之间传递状态
- **WHEN** 上一轮 Planner action 执行完成并进入下一轮
- **THEN** `AgentLoopState` MUST 记录上一轮 action、validation result、tool result、evidence、预算状态和 terminal gate 状态
- **AND** 下一轮 `PlannerStateView` MUST 只暴露经脱敏、去重和结构化后的状态摘要
- **AND** 系统 MUST NOT 依靠自由文本拼接来表达权威状态

### Requirement: PlannerStateView 必须表达当前目标、证据、缺口和终态约束
系统 SHALL 为 `PlannerStateView` 定义稳定结构，至少覆盖 `currentInput`、`visibleContext`、`actionHistory`、`evidence`、`pendingRequirements` 和 `terminalConstraints`。这些字段 MUST 用结构化方式表达模型下一步决策所需的信息，不把具体业务短句写成服务端决策规则。

#### Scenario: state view 包含下一步决策上下文
- **WHEN** Runtime 构造 `PlannerStateView`
- **THEN** `currentInput` MUST 表达当前用户输入和本轮可见上下文摘要
- **AND** `visibleContext` MUST 表达当前 run 可引用的 visible resource、conversation object 和用户可见对象摘要
- **AND** `actionHistory` MUST 表达最近已执行 action 的类型、状态、引用和错误摘要
- **AND** `evidence` MUST 表达当前 run 已获得的事实和缺口
- **AND** `pendingRequirements` MUST 表达仍未满足但可能可恢复的结构化要求
- **AND** `terminalConstraints` MUST 表达允许成功收口、追问、阻断和失败收口的通用规则

#### Scenario: state view 不承载业务语义分流
- **WHEN** `PlannerStateView` 表达目标、证据或缺口
- **THEN** 系统 MUST NOT 根据用户原文关键词、正则、同义词表、短句模板或测试样例生成 action、`toolName`、调用顺序或最终回复策略
- **AND** 具体业务名只能作为 tool manifest、tool observation、resource contract、evidence fact 或测试样例出现

### Requirement: ToolResult 必须归一化为 Evidence 后进入 PlannerStateView
系统 SHALL 将每个已登记 `ToolResult` 投影为一个或多个模型可见 `Evidence`。`Evidence` MUST 保留可验证事实、支持能力、缺口、阻断输出、引用和可恢复方向，但不得泄漏完整 handler output 或敏感 payload。

#### Scenario: 成功 tool result 生成 evidence
- **WHEN** Executor 产生 `ok = true` 的 `ToolResult`
- **THEN** Runtime MUST 为该结果登记稳定 `toolResultId`
- **AND** Runtime MUST 从安全 projection、resource summary 和 fulfillment 生成 `Evidence`
- **AND** `Evidence` MUST 能表达 `facts`、`supports`、`missing`、`blockedOutputs`、`refs` 和可恢复的下一步能力摘要
- **AND** `Evidence` MUST NOT 默认包含完整 tool output、完整数据库对象、secret、内部 capability 或跨用户 payload

#### Scenario: 失败或未满足 tool result 生成 diagnostic evidence
- **WHEN** Executor 产生 failed、diagnostic 或 `fulfillment.satisfied = false` 的 `ToolResult`
- **THEN** Runtime MUST 将其登记为诊断 evidence
- **AND** 该 evidence MUST 能用于解释、追问、repair 或阻断说明
- **AND** 该 evidence MUST NOT 被 `TerminalGate` 当作成功完成的充分依据

### Requirement: TerminalGate 必须校验结构化终态完成度
系统 SHALL 在接受 `final_answer`、`ask_user` 或等价 terminal action 前执行通用 `TerminalGate` 校验。Terminal action MUST 声明结构化 outcome，至少区分 `complete`、`partial`、`needs_input` 和 `blocked`，并与 evidence、pending requirements、usedRefs 和 visibleOutputs 自洽。

#### Scenario: 成功 final_answer 通过 terminal gate
- **WHEN** Planner 返回 `final_answer`
- **AND** action 声明 `outcome = "complete"` 或等价成功完成状态
- **THEN** `TerminalGate` MUST 校验不存在阻断成功收口的 `pendingRequirements`
- **AND** `TerminalGate` MUST 校验 `usedRefs`、resource refs 和 `visibleOutputs[]` 均来自当前 run 已登记且可消费的 evidence 或 resource
- **AND** `TerminalGate` MUST 校验 failed、diagnostic 或 unsatisfied evidence 没有被当作成功依据

#### Scenario: 有可恢复缺口时 final_answer 不得伪装成功
- **WHEN** `PlannerStateView.pendingRequirements` 存在当前可见 tool 或澄清可以恢复的缺口
- **AND** Planner 返回 `outcome = "complete"` 的 `final_answer`
- **THEN** `TerminalGate` MUST 拒绝该 terminal action
- **AND** Runtime MUST 生成结构化 invalid terminal evidence 或 repair feedback
- **AND** Runtime MUST NOT 通过解析用户原文或 final answer 正文来猜测是否应该成功

#### Scenario: partial 或 needs_input 终态可安全收口
- **WHEN** Planner 返回 `outcome = "partial"`、`outcome = "needs_input"` 或等价非完成状态
- **THEN** `TerminalGate` MUST 校验该状态引用的 evidence 能解释缺口、追问或阻断原因
- **AND** Response Renderer MUST 能把该状态转换为用户可见的追问、可恢复建议或安全失败说明
- **AND** 系统 MUST NOT 把该状态统计为直接完成

### Requirement: Agent Loop 核心不得包含业务 toolName 或 phrasing 特判
系统 SHALL 保持 Agent Loop 核心只处理通用状态、schema、policy、resource、evidence、budget、terminal 和 trace 边界。业务语义由模型基于 prompt、manifest、schema description、examples、context 和 evidence 理解。

#### Scenario: 核心 Loop 处理下一步决策
- **WHEN** Runtime、PlannerPort adapter、Action Validator、Executor、ResourceStore、TerminalGate 或 Response Renderer 处理任意 action
- **THEN** 这些核心模块 MUST NOT 基于具体业务 `toolName` 写语义分支
- **AND** 这些核心模块 MUST NOT 基于用户自然语言关键词、正则、同义词表、短句模板或测试样例改写 action、tool input、调用顺序、引用目标或最终回复策略
- **AND** 业务 tool 的事实、能力和限制 MUST 通过 tool manifest、tool schema、resource contract、evidence projection 或测试表达

### Requirement: 现有业务 tool 必须通过兼容 adapter 接入 Evidence 合同
系统 SHALL 允许现有 tool 在不重写 handler 和 schema 的前提下接入新的 evidence pipeline。缺少专属 evidence projector 的 tool MUST 使用默认安全 adapter，直到该 tool 需要暴露更丰富的事实。

#### Scenario: 现有 tool 缺少专属 Evidence projector
- **WHEN** 现有已注册 tool 成功执行但没有提供专属 Evidence projector
- **THEN** Runtime MUST 使用默认安全 adapter 生成 evidence 摘要
- **AND** 默认 evidence MUST 保留 `toolResultId`、tool name/version、ok 状态、fulfillment、resource refs 和安全摘要
- **AND** 默认 evidence MUST NOT 暴露完整 handler output
- **AND** 新 evidence pipeline MUST NOT 要求业务 tool handler、数据库查询语义或 ToolRegistry 注册模式同步重写

#### Scenario: 业务 tool 提供更丰富 Evidence projector
- **WHEN** 某业务 tool 需要向 Planner 暴露更丰富的 facts、missing 或 blockedOutputs
- **THEN** 该 tool 扩展 evidence 内容时 MUST 通过稳定 projection / resource contract 表达
- **AND** 扩展 MUST 通过 tool-level contract tests 覆盖 redaction、resource refs、fulfillment 和模型可见中文说明
- **AND** 扩展 MUST NOT 修改 Agent Loop 核心来识别该具体 `toolName`
