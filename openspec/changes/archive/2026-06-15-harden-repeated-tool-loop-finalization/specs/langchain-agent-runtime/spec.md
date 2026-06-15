## ADDED Requirements

### Requirement: Runtime 必须把连续上限移除后的同 tool 调用归一为 terminal loop failure
系统 SHALL 区分“当前 request 未暴露的普通未知 tool”和“因连续业务 tool 上限被当前 request 移除的 exhausted tool”。当 provider 继续请求后者时，runtime MUST 将该 tool call 归一为连续业务 tool 超限失败，并进入 terminal loop failure 收口。该判断 MUST 只基于 runtime 维护的 tool catalog、当前 request tools、业务 tool 连续调用计数和集中配置上限，MUST NOT 基于用户原文、关键词、正则、同义词、短句模板或具体 phrasing。

#### Scenario: 已移除业务 tool 被继续调用时终止主 Agent loop
- **WHEN** 某个 `executionKind = "business"` 的 tool 在当前 Agent run 中最近连续调用序列已达到集中配置的连续调用上限
- **AND** runtime 在下一次 provider request 的 `tools` 列表中移除了该 tool
- **AND** provider 仍返回该 tool 的 `tool_call`
- **THEN** runtime MUST 拒绝执行该 tool handler
- **AND** runtime MUST 记录 `code = "tool_consecutive_call_limit_exceeded"` 或等价稳定 trace summary
- **AND** runtime MUST 将当前主 Agent run 归一化为 terminal failure
- **AND** runtime MUST NOT 继续向同一主 Agent loop 提供普通 `unknown_tool` 反馈让模型重复尝试
- **AND** runtime MUST NOT 因该非法尝试重复消耗业务 tool handler 执行预算

#### Scenario: 普通未暴露 tool 仍按 unknown_tool 拒绝
- **WHEN** provider 返回当前 request `tools` 列表之外的 tool call
- **AND** 该 tool 不属于当前 request 因连续业务 tool 上限移除的 exhausted tool
- **THEN** runtime MUST 拒绝执行 handler
- **AND** runtime MUST 记录 `code = "unknown_tool"` 或等价稳定拒绝 code
- **AND** runtime MUST NOT 临时执行同名、相邻或历史注册的业务能力

#### Scenario: 连续上限终止不写业务语义分支
- **WHEN** runtime 判断 provider 返回的 tool call 是否命中 exhausted tool
- **THEN** 判断依据 MUST 来自通用 tool wrapper metadata、当前 request tools、连续调用计数和集中配置
- **AND** runtime MUST NOT 为 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`submitVisibleTrainingProposal` 或未来具体业务 tool 编写语义特判
- **AND** runtime MUST NOT 根据用户自然语言、业务字段组合或具体 trace phrasing 改写 provider tool call、tool input 或最终回答策略
