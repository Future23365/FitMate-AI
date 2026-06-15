## MODIFIED Requirements

### Requirement: Runtime 必须限制业务 tool 的单轮重复请求和执行
系统 SHALL 在生产 LangChain Agent Runtime 中限制模型连续重复请求同一个业务 tool。该限制 MUST 基于当前 production tool wrapper 列表自动生成，MUST 只统计 `executionKind = "business"` 的真实业务 tool 连续序列，并且 MUST 不替代整轮业务 tool 总预算。连续同 tool 限制 MUST 以 provider model response 批次作为计数单位：同一 `AIMessage.tool_calls` 批次内同一业务 tool 的多个不同输入请求 SHALL 视为一次模型决策中的并列 fan-out，不得被计为多个跨 observation 的连续 loop。`runtimeMetadata` MUST NOT 被视为一个独立 tool，也不得打断或重置业务 tool 连续计数。Runtime MUST NOT 在该限制中写用户原文、关键词、业务 phrasing 或具体业务 `toolName` 语义分支。

#### Scenario: 每个业务 tool 自动获得连续调用上限
- **WHEN** Runtime 基于 production tool wrappers 构造 `createAgent`
- **THEN** Runtime MUST 为每个 `executionKind = "business"` 的 tool 配置连续模型决策批次上限
- **AND** 连续批次上限 MUST 来自集中配置
- **AND** Runtime MUST NOT 手写用户原文关键词、短句模板或自然语言语义判断来决定某个 tool 是否可重试

#### Scenario: 同一模型响应中的同名不同输入 fan-out 不触发连续超限
- **WHEN** 某次 provider model response 返回同一业务 tool 的多个 `tool_calls`
- **AND** 这些 tool calls 的归一化业务 input 不完全相同
- **THEN** Runtime MUST 将该批次视为一次模型决策中的并列 fan-out
- **AND** Runtime MUST NOT 仅因该批次内同名 tool call 数量超过 `maxToolCallsPerTool` 就触发 `tool_consecutive_call_limit_exceeded`
- **AND** 每个实际执行的业务 tool call MUST 继续消耗整轮业务 tool 总预算
- **AND** 该行为 MUST 不绕过 schema、权限、projection、trace 和最终结构化回复校验

#### Scenario: 同一模型响应中的同名同参请求仍按 duplicate input 处理
- **WHEN** 某次 provider model response 返回同一业务 tool 的多个 `tool_calls`
- **AND** 其中至少两个 tool calls 具有相同 `toolName`、相同 `toolVersion` 和等价归一化业务 input
- **THEN** Runtime MUST NOT 因 batch-aware fan-out 重复执行等价 handler
- **AND** Runtime MUST 使用 duplicate input 或等价通用诊断反馈处理重复同参请求
- **AND** Runtime MUST NOT 根据具体业务字段组合或业务 section 判断是否复用事实

#### Scenario: 连续达到单 tool 批次上限后不再暴露给后续 provider 请求
- **WHEN** 当前 Agent run 中最近连续 provider model response 批次已经达到某业务 tool 的连续调用上限
- **THEN** Runtime MUST 在后续 model request 中从可用 `tools` 列表移除该业务 tool
- **AND** 模型后续 provider tool_call 尝试 MUST NOT 继续消耗整轮业务 tool 总预算

#### Scenario: 连续超限后终止主 Agent loop
- **WHEN** 模型跨 provider model response 批次连续调用某个业务 tool 超过集中配置的连续调用上限
- **THEN** LangChain Runtime MUST 阻止该超限 tool call 执行对应 handler
- **AND** Runtime MUST 记录稳定失败 execution、失败摘要和 trace summary
- **AND** Runtime MUST 将当前主 Agent run 归一化为 terminal failure
- **AND** Runtime MUST NOT 允许模型通过调用其他业务 tool、重复历史查询 tool 或改变 tool input 继续推进同一个主 Agent loop
- **AND** 该行为 MUST 不绕过项目现有 schema、权限、projection、trace 和最终结构化回复校验

#### Scenario: runtime metadata 不打断业务 tool 连续计数
- **WHEN** 模型跨 provider model response 批次连续调用同一个业务 tool 达到上限
- **AND** 后续 tool call 仅改变或携带 `runtimeMetadata.activitySummary`
- **THEN** Runtime MUST NOT 将 `runtimeMetadata` 视为独立 tool 或业务 tool 连续序列的打断点
- **AND** Runtime MUST 继续按真实业务 `toolName`、tool version 和模型决策批次计算连续限制
- **AND** `runtimeMetadata.activitySummary` MUST NOT 消耗旧 activity report 预算或任何独立 activity 预算

#### Scenario: 连续超限失败用于受控失败收口
- **WHEN** Runtime 因连续业务 tool 超限终止主 Agent run
- **THEN** `/api/chat` MAY 使用现有 terminal failure finalizer 或确定性 fallback 生成用户可见失败说明
- **AND** terminal failure finalizer MUST NOT 接收 tool catalog 或继续执行原始任务
- **AND** 用户可见回复 MUST NOT 声称已经完成未发生的工具执行、结构化训练输出、保存或训练事实写入

#### Scenario: 全局预算仍然作为安全熔断
- **WHEN** 模型跨多个业务 tool 的总调用次数超过集中配置的整轮业务 tool 总预算
- **THEN** Runtime MUST 继续阻止后续业务 tool handler
- **AND** Runtime MUST 记录或返回稳定预算失败
- **AND** 连续同 tool 限制 MUST NOT 删除整轮安全熔断
