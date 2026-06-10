## MODIFIED Requirements

### Requirement: AgentAction 必须经过确定性校验
系统 SHALL 定义 `AgentAction` Schema，并在执行前校验 `tool_call`、`final_answer` 和 `ask_user` 的结构、引用和可执行边界。系统 SHALL 在合法 `type` discriminator 已确定后，按该 action variant 的顶层字段 allowlist 对模型输出执行 normalization，丢弃不参与当前 variant 执行语义的未知顶层字段。`final_answer` 与 `ask_user` SHALL 都使用 `content` 承载用户可见文本；terminal action SHALL 使用统一 `usedRefs` 承载已使用事实来源引用。

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

#### Scenario: tool_call 顶层多余 content 不阻断工具执行
- **WHEN** Planner 返回 `type = "tool_call"` 的 `AgentAction`
- **AND** action 包含已注册 `toolName`
- **AND** action 包含符合目标 tool input schema 的 `input`
- **AND** action 顶层额外包含 `content`、`suggestedQuestions`、`visibleOutputs` 或其他不属于 `tool_call` allowlist 的字段
- **THEN** Action Validator MUST 丢弃这些不属于 `tool_call` 的顶层字段
- **AND** Action Validator MUST 接受 normalized `tool_call`
- **AND** Executor MUST 只使用 normalized action 的 `toolName` 和 `input` 调用 tool
- **AND** Runtime MUST NOT 将被丢弃字段发送给前端、写入 tool input、登记为 resource、用于 grounding 或用于最终回答

#### Scenario: tool_call 执行关键字段错误仍然失败
- **WHEN** Planner 返回 `type = "tool_call"` 的 `AgentAction`
- **AND** action 缺少 `toolName` 或 `input`
- **OR** `toolName` 未注册
- **OR** `input` 不符合对应 tool input schema
- **THEN** Action Validator 或 tool input validator MUST 拒绝该 action
- **AND** Runtime MUST NOT 通过丢弃顶层字段、读取用户原文或使用默认业务参数来补齐执行关键字段
- **AND** Runtime MUST 按现有 invalid action / invalid tool input / repair 边界处理

#### Scenario: normalization 不转换旧同义字段
- **WHEN** Planner 返回一个合法 `type` discriminator
- **AND** action 缺少该 variant 的 required field
- **AND** action 额外包含旧同义字段或其他看似可替代字段
- **THEN** Action Validator MUST NOT 将额外字段转换为 required field
- **AND** Action Validator MUST 拒绝该 action 或进入结构化 repair
- **AND** Runtime MUST NOT 建立旧字段到新字段的长期兼容映射
