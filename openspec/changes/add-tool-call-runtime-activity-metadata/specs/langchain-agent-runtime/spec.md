## REMOVED Requirements

### Requirement: LangChain runtime 必须支持模型活动汇报 tool
**Reason**: 独立 `reportAgentActivity` tool 把 UI 活动状态升级成一次 Agent action；当模型只调用该 tool 时，服务端会继续进入下一轮 model/tool loop，容易造成空转和重复文案滚动。

**Migration**: 使用业务 tool call arguments 中的 `runtimeMetadata.activitySummary` 承载当前请求内 UI 状态摘要，由通用 LangChain tool wrapper 在业务 handler 执行前投影活动事件。

### Requirement: LangChain runtime 必须把模型活动汇报投影为 request-local observer 事件
**Reason**: observer 活动事件不应依赖独立 activity tool 的成功执行。新的来源是业务 tool call 的 request-local runtime metadata，事件生命周期绑定当前业务 tool wrapper 执行前。

**Migration**: wrapper / runtime observer 在业务 tool handler 执行前读取并校验 `runtimeMetadata.activitySummary`，再投影 `agent_progress` 或等价 request-local activity event。

### Requirement: 模型可见 prompt 必须说明活动汇报 tool 的用途和边界
**Reason**: `reportAgentActivity` 不再是推荐的生产模型可见 tool 合同。继续在 prompt 中说明该 tool 会鼓励模型单独调用它，从而重新引入 activity-only loop。

**Migration**: 模型可见说明迁移到业务 tool schema / tool description 的 `runtimeMetadata.activitySummary` 字段说明；system prompt 只保留顶层预算、非业务事实和不得泄漏内部字段的稳定边界。

## MODIFIED Requirements

### Requirement: LangChain graph step 预算必须与模型调用预算同步
系统 SHALL 将传给 LangChain agent 的 `recursionLimit` 视为 graph step 预算，而不是旧自研 Agent 的迭代次数。`recursionLimit` MUST 由集中配置中的真实模型调用预算推导，且 MUST 为工具调用后的最终结构化回答预留 graph step 空间。业务 tool call 的 `runtimeMetadata` MUST 只作为当前 tool invocation 的 request-local metadata，不得产生额外 provider tool call、ToolMessage、model call 或 graph step。

#### Scenario: 工具调用后仍可提交最终回答
- **WHEN** LangChain runtime 的集中配置允许 N 次模型调用
- **AND** 模型在前 N-1 次调用中持续返回合法 provider `tool_calls`
- **THEN** runtime MUST 为第 N 次模型调用提交 `fitmate_final_response` 保留 LangChain graph step 预算
- **AND** runtime MUST NOT 因旧 `maxIterations + 2` 计算提前触发 `budget_exhausted`

#### Scenario: 模型调用预算耗尽
- **WHEN** LangChain runtime 即将发起超过集中配置 `maxModelCalls` 的 provider model call
- **THEN** runtime MUST 停止继续调用 provider
- **AND** runtime MUST 返回稳定 `budget_exhausted` 失败
- **AND** trace summary MUST 保留已经发生的 model call、provider tool call 和 tool execution 摘要

#### Scenario: runtime metadata 不消耗额外预算
- **WHEN** 模型在业务 tool arguments 中携带 `runtimeMetadata.activitySummary`
- **THEN** 该 metadata 本身 MUST NOT 产生额外 provider `tool_call`、LangChain `ToolMessage`、model call 或 graph step
- **AND** 该 metadata 本身 MUST NOT 消耗业务 tool 调用预算、旧 activity report 预算或模型调用预算
- **AND** activity 投影 MUST 只作为当前业务 tool wrapper 执行前的 request-local event
- **AND** runtime MUST NOT 为 activity summary 保留独立 activity report 上限或空转 loop 边界

### Requirement: Runtime 必须限制业务 tool 的单轮重复请求和执行
系统 SHALL 在生产 LangChain Agent Runtime 中限制模型连续重复请求同一个业务 tool。该限制 MUST 基于当前 production tool wrapper 列表自动生成，MUST 只统计 `executionKind = "business"` 的真实业务 tool 连续序列，并且 MUST 不替代整轮业务 tool 总预算。`runtimeMetadata` MUST NOT 被视为一个独立 tool，也不得打断或重置业务 tool 连续计数。Runtime MUST NOT 在该限制中写用户原文、关键词、业务 phrasing 或具体业务 `toolName` 语义分支。

#### Scenario: 每个业务 tool 自动获得连续调用上限
- **WHEN** Runtime 基于 production tool wrappers 构造 `createAgent`
- **THEN** Runtime MUST 为每个 `executionKind = "business"` 的 tool 配置连续调用上限
- **AND** 连续调用上限 MUST 来自集中配置
- **AND** Runtime MUST NOT 手写用户原文关键词、短句模板或自然语言语义判断来决定某个 tool 是否可重试

#### Scenario: 连续达到单 tool 上限后不再暴露给后续 provider 请求
- **WHEN** 当前 Agent run 中最近连续业务 tool 调用序列已经达到某业务 tool 的连续调用上限
- **THEN** Runtime MUST 在后续 model request 中从可用 `tools` 列表移除该业务 tool
- **AND** 其他业务 tool SHOULD 继续可用
- **AND** 模型后续 provider tool_call 尝试 MUST NOT 继续消耗整轮业务 tool 总预算

#### Scenario: 被其他业务 tool 打断后允许再次调用同一业务 tool
- **WHEN** 模型连续调用某个业务 tool 达到上限
- **AND** 模型随后成功或失败地调用了另一个业务 tool
- **THEN** Runtime MUST 将前一个业务 tool 的连续计数视为已被业务 tool 打断
- **AND** Runtime MUST 允许后续 model request 再次暴露前一个业务 tool
- **AND** 该再次调用仍 MUST 受整轮业务 tool 总预算和新的连续调用上限约束

#### Scenario: runtime metadata 不打断业务 tool 连续计数
- **WHEN** 模型连续调用同一个业务 tool 达到上限
- **AND** 后续 tool call 仅改变或携带 `runtimeMetadata.activitySummary`
- **THEN** Runtime MUST NOT 将 `runtimeMetadata` 视为独立 tool 或业务 tool 连续序列的打断点
- **AND** Runtime MUST 继续按真实业务 `toolName`、tool version 和归一化业务 input 计算连续限制
- **AND** `runtimeMetadata.activitySummary` MUST NOT 消耗旧 activity report 预算或任何独立 activity 预算

#### Scenario: 连续超限不执行 handler
- **WHEN** 模型连续调用同一业务 tool 超过集中配置的连续调用上限
- **THEN** LangChain Runtime MUST 阻止该超限 tool call 执行对应 handler
- **AND** 同一 model response 内已经超出连续上限的 tool_call MAY 进入 LangChain tool limit 失败结果
- **AND** 该行为 MUST 不绕过项目现有 schema、权限、projection、trace 和最终结构化回复校验

#### Scenario: 全局预算仍然作为安全熔断
- **WHEN** 模型跨多个业务 tool 的总调用次数超过集中配置的整轮业务 tool 总预算
- **THEN** Runtime MUST 继续阻止后续业务 tool handler
- **AND** Runtime MUST 记录或返回稳定预算失败
- **AND** 连续同 tool 限制 MUST NOT 删除整轮安全熔断
