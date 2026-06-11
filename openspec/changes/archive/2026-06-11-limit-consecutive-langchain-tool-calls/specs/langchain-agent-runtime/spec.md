## MODIFIED Requirements

### Requirement: Runtime 必须限制业务 tool 的单轮重复请求和执行
系统 SHALL 在生产 LangChain Agent Runtime 中限制模型连续重复请求同一个业务 tool。该限制 MUST 基于当前 production tool wrapper 列表自动生成，MUST 只统计 `executionKind != "activity"` 的业务 tool 连续序列，并且 MUST 不替代整轮业务 tool 总预算。Runtime MUST NOT 在该限制中写用户原文、关键词、业务 phrasing 或具体业务 `toolName` 语义分支。

#### Scenario: 每个业务 tool 自动获得连续调用上限
- **WHEN** Runtime 基于 production tool wrappers 构造 `createAgent`
- **THEN** Runtime MUST 为每个 `executionKind != "activity"` 的 tool 配置连续调用上限
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

#### Scenario: activity tool 不打断业务 tool 连续计数
- **WHEN** 模型连续调用同一个业务 tool 达到上限
- **AND** 模型随后调用 `reportAgentActivity` 或等价 `executionKind = "activity"` 的 tool
- **THEN** Runtime MUST NOT 将 activity tool 视为打断业务 tool 连续序列
- **AND** Runtime MUST 继续阻止后续连续调用该业务 tool
- **AND** activity tool MUST 继续只消耗自身 activity report 预算、模型调用预算和 graph step 预算

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
