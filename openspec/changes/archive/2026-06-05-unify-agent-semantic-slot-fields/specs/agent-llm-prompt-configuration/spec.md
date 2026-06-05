## ADDED Requirements

### Requirement: 默认 prompt 必须用短 JSON 形状表达 AgentAction 字段
系统 SHALL 在默认 Agent LLM prompt 或等价模型可见输入中，用简短 JSON 形状表达当前允许的 `AgentAction` 类型和必需字段。字段示例 MUST 与当前 schema 完全一致，并且 MUST 遵守同一语义槽只使用一个字段名的原则。

#### Scenario: prompt 展示三类 action 的合法形状
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** 模型可见输入 MUST 包含 `tool_call`、`final_answer` 和 `ask_user` 的最小合法 JSON 形状
- **AND** `final_answer` 示例 MUST 使用 `content`
- **AND** `ask_user` 示例 MUST 使用 `content`
- **AND** `tool_call` 示例 MUST 使用 `toolName` 和 `input`
- **AND** 示例 MUST NOT 使用 `ask_user.question`、`usedToolResultIds`、`usedResourceRefs` 或其他已废弃同义字段

#### Scenario: prompt 说明语义差异由 type 表达
- **WHEN** 模型可见输入说明 terminal action
- **THEN** prompt MUST 说明 `final_answer` 与 `ask_user` 的用户可见文本都写入 `content`
- **AND** prompt MUST 说明两者差异由 action `type` 表达
- **AND** prompt MUST 使用中文解释业务含义，`type`、`content`、`tool_call`、`final_answer`、`ask_user` 等技术标识保持英文原样

#### Scenario: prompt 说明旧字段不可用
- **WHEN** prompt 描述字段要求或 repair 规则
- **THEN** prompt MUST 明确 `ask_user.question`、`final_answer.assistantSuggestions`、`ask_user.suggestions`、`usedToolResultIds` 和 `usedResourceRefs` 不属于新主合同
- **AND** prompt MUST NOT 暗示服务端会把这些字段转换成新字段
- **AND** prompt MUST 引导模型在 repair 时直接输出新字段形状

### Requirement: 默认 prompt 必须表达统一 grounding 引用字段
系统 SHALL 在默认 Agent LLM prompt 中表达 terminal action 使用统一 `usedRefs` 引用当前 run 中已登记事实来源。Prompt MUST NOT 继续要求模型在 tool result 和 resource 之间切换不同顶层字段名。

#### Scenario: prompt 说明 usedRefs 结构
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `usedRefs` 是 terminal action 的统一事实来源引用数组
- **AND** `tool_result` 引用 MUST 使用 `{ "type": "tool_result", "id": "..." }` 或当前 schema 等价结构
- **AND** `resource` 引用 MUST 使用 `{ "type": "resource", "id": "...", "resourceType": "..." }` 或当前 schema 等价结构
- **AND** prompt MUST 说明 `visibleOutputs[]` 仍是结构化用户可见输出，不是 grounding 引用的同义字段

#### Scenario: prompt 不改变 grounding 安全边界
- **WHEN** prompt 描述 `usedRefs`
- **THEN** prompt MUST 说明服务端仍会校验 tool result、resource role、resourceType、当前 run 归属和 satisfied 状态
- **AND** prompt MUST 说明 failed、diagnostic 或 `satisfied=false` 结果不能支撑成功 `final_answer`
- **AND** prompt MUST NOT 要求模型绕过 ResourceStore、Policy Guard、Resource Contract Validator 或 Response Renderer
