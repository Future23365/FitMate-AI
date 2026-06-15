## ADDED Requirements

### Requirement: Runtime 必须拒绝执行当前 request 未暴露的 provider tool call
系统 SHALL 在每次 LangChain model request / response 边界维护当前 request 实际暴露的 tool name 集合。Provider 返回的 `tool_calls[].name` 如果不在该集合中，runtime MUST NOT 执行任何业务 tool handler，并 MUST 以受控失败记录 trace 和进入失败收口。该校验 MUST 使用通用 tool name 可用性集合，不得读取用户原文、关键词、短句模板或具体业务字段组合。

#### Scenario: 已移除工具不得继续执行
- **WHEN** 某次 model request 的 `tools` 列表不包含某个业务 tool
- **AND** provider response 仍返回该 tool name 的 `tool_call`
- **THEN** runtime MUST NOT 调用该 tool wrapper 的 handler
- **AND** runtime MUST 记录稳定失败 execution 或 run failure
- **AND** failure MUST 可由 production response adapter / terminal failure finalizer 受控收口
- **AND** runtime MUST NOT 为该未暴露 tool call 消耗业务 handler 执行预算

#### Scenario: 拦截逻辑不写业务 toolName 分支
- **WHEN** runtime 判断 provider `tool_call` 是否可执行
- **THEN** 判断 MUST 基于当前 request 暴露的 tool name 集合
- **AND** runtime MUST NOT 为 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`submitVisibleTrainingProposal` 或其他具体业务 tool 编写语义分支
- **AND** runtime MUST NOT 根据用户自然语言、关键词、正则、同义词表或具体 phrasing 改写 provider `tool_calls`

#### Scenario: 合法暴露工具保持原执行路径
- **WHEN** provider response 返回的 `tool_call.name` 存在于当前 request 的 `tools` 列表
- **THEN** runtime MUST 继续使用现有 LangChain tool wrapper、schema 校验、权限隔离、投影和 trace 边界执行该 tool
- **AND** 本可用性校验 MUST NOT 绕过现有 schema、permission、projection、trace 或最终结构化回复校验
