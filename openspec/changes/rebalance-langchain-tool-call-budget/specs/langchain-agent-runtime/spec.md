## ADDED Requirements

### Requirement: Runtime 必须限制业务 tool 的单轮重复请求和执行
系统 SHALL 在生产 LangChain Agent Runtime 中使用 LangChain middleware，为每个业务 tool 设置单轮调用上限。该限制 MUST 同时覆盖后续 provider 请求中的 tool 可见性和实际 handler 执行；限制 MUST 由当前 production tool wrapper 列表自动生成，不得在 runtime 中写用户原文、关键词或业务 phrasing 分支。

#### Scenario: 每个业务 tool 自动获得 runLimit
- **WHEN** Runtime 基于 production tool wrappers 构造 `createAgent`
- **THEN** Runtime MUST 为每个 `executionKind != "activity"` 的 tool 配置 per-tool run limit
- **AND** per-tool run limit MUST 来自集中配置
- **AND** Runtime MUST NOT 手写用户原文关键词、短句模板或自然语言语义判断来决定某个 tool 是否可重试

#### Scenario: 达到单 tool 上限后不再暴露给后续 provider 请求
- **WHEN** 当前 Agent run 中某个业务 tool 的 provider tool_call 次数已经达到 per-tool run limit
- **THEN** Runtime MUST 在后续 model request 中从可用 `tools` 列表移除该业务 tool
- **AND** 其他未达上限的业务 tool SHOULD 继续可用
- **AND** 模型后续 provider tool_call 尝试 MUST NOT 继续消耗整轮业务 tool 总预算

#### Scenario: 单个业务 tool 超限不执行 handler
- **WHEN** 模型在同一 run 中调用同一业务 tool 超过 per-tool run limit
- **THEN** LangChain Runtime MUST 阻止该超限 tool call 执行对应 handler
- **AND** 同一 model response 内已经超出上限的 tool_call MAY 进入 LangChain tool limit 失败结果
- **AND** 该行为 MUST 不绕过项目现有 schema、权限、projection、trace 和最终结构化回复校验

#### Scenario: 全局预算仍然作为安全熔断
- **WHEN** 模型跨多个业务 tool 的总调用次数超过集中配置的整轮业务 tool 总预算
- **THEN** Runtime MUST 继续阻止后续业务 tool handler
- **AND** Runtime MUST 记录或返回稳定预算失败
- **AND** per-tool 限制 MUST NOT 删除整轮安全熔断
