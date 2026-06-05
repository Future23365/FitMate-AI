## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: AgentAction 必须经过确定性校验
系统 SHALL 定义 `AgentAction` Schema，并在执行前校验 `tool_call`、`final_answer` 和 `ask_user` 的结构、引用和可执行边界。`final_answer` 与 `ask_user` SHALL 都使用 `content` 承载用户可见文本；terminal action SHALL 使用统一 `usedRefs` 承载已使用事实来源引用。

#### Scenario: 合法 tool_call
- **WHEN** Planner 返回 `tool_call`
- **THEN** Action Validator MUST 校验 action 结构合法
- **AND** `toolName` MUST 已注册且当前可用
- **AND** `input` MUST 通过对应 tool 的 `inputSchema`
- **AND** 只有校验通过后 Runtime 才能调用 Executor

#### Scenario: 未知 tool 或非法 input
- **WHEN** Planner 返回未知 `toolName` 或不符合 Schema 的 `input`
- **THEN** Runtime MUST NOT 执行 handler
- **AND** Runtime MUST 生成可诊断 invalid action observation 或 terminal error
- **AND** 错误 MUST 包含稳定 code，便于测试和后续 repair

#### Scenario: 合法 final_answer terminal action
- **WHEN** Planner 返回 `final_answer`
- **THEN** Action Validator MUST 要求用户可见文本写入 `content`
- **AND** 如果 action 包含 `usedRefs`，validator MUST 校验每个 ref 属于当前 run 的已登记事实来源
- **AND** `usedRefs[type = "tool_result"]` MUST 指向当前 run 中已登记且可支撑该回答的 tool result
- **AND** `usedRefs[type = "resource"]` MUST 指向当前 run 中已登记且 role / resourceType 满足 terminal grounding 要求的 resource
- **AND** `final_answer` MUST NOT 携带任意 NDJSON event、未登记 resource 或 handler output

#### Scenario: 合法 ask_user terminal action
- **WHEN** Planner 返回 `ask_user`
- **THEN** Action Validator MUST 要求用户可见追问文本写入 `content`
- **AND** 如果 action 包含 `usedRefs`，validator MUST 允许其引用可用于解释、阻断或澄清的 tool result 或 resource
- **AND** Runtime MUST 将该 action 作为需要用户输入的 terminal action 收口
- **AND** `ask_user` MUST NOT 携带 `question`、`message` 或其他与 `content` 同义的用户可见文本字段

#### Scenario: 拒绝旧 terminal 字段
- **WHEN** Planner 返回 `ask_user.question`
- **OR** Planner 返回 terminal action 中的 `usedToolResultIds`
- **OR** Planner 返回 terminal action 中的 `usedResourceRefs`
- **THEN** Action Validator MUST 拒绝该 action
- **AND** repair details MUST 指出当前合同应使用 `content` 和 `usedRefs`
- **AND** Runtime MUST NOT 静默转换旧字段
