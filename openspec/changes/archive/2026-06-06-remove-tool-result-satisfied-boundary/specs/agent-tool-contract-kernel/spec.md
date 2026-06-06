## MODIFIED Requirements

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
