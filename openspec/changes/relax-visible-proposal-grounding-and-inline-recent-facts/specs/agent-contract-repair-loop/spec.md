## MODIFIED Requirements

### Requirement: Repair feedback 必须修复当前 Planner 可见合同
系统 SHALL 在模型输出违反 `AgentAction`、tool input 或 terminal visible output envelope 的结构合同时，通过通用 schema error projector 生成模型可见 repair feedback。Repair feedback MUST 对齐当前 Planner 可见合同；当旧内部引用字段出现时，feedback MUST 要求删除或改用业务结构，而不是要求模型补正确的内部 ID。

#### Scenario: AgentAction 包含旧 usedRefs 字段
- **WHEN** 模型返回的 `final_answer` 或 `ask_user` 中包含 `usedRefs`、`usedToolResultIds` 或 `usedResourceRefs`
- **THEN** repair feedback MUST 定位到对应字段路径
- **AND** feedback MUST 说明这些字段不属于当前 Planner 可见合同
- **AND** feedback MUST 要求模型删除这些字段
- **AND** feedback MUST NOT 要求模型改填某个 `toolResultId`、`resourceId` 或 resource ref

#### Scenario: tool_call 包含旧 resource consumption 字段
- **WHEN** 模型返回的 `tool_call` 中包含 `consumes`、`resourceId`、`resource`、`factRef`、`messageId` 或 `toolResultId`
- **THEN** repair feedback MUST 定位到对应字段路径
- **AND** feedback MUST 说明资源选择和 provenance 由服务端内部维护
- **AND** feedback MUST 要求模型只保留合法 `toolName` 和匹配 schema 的业务 `input`
- **AND** feedback MUST NOT 引导模型从 observations、metadata、trace 或历史文本中复制内部 ID

#### Scenario: visible output validation failure 不要求补引用
- **WHEN** `final_answer.visibleOutputs[]` 通过静态 envelope 但未通过业务 terminal output validator
- **THEN** feedback MUST 保留 output index、`outputType`、`schemaVersion` 和业务 validator 返回的脱敏 details
- **AND** 如果失败原因是数据库动作、payload、prescription、schedule 或 section 边界，feedback MUST 要求修正业务 payload
- **AND** feedback MUST NOT 要求模型通过 `usedRefs`、`read_recent`、`resourceId` 或 current-run tool result provenance 来修复新生成卡片

### Requirement: terminal failure finalizer 输入不得恢复旧 AgentAction 引用合同
系统 SHALL 在 terminal failure finalizer 的模型输入中提供用户可见失败解释所需的脱敏摘要。该输入 MUST NOT 要求 finalizer 理解或输出主 Agent 的 `usedRefs`、`resourceId`、`toolResultId`、`factRef`、`messageId` 或其他内部引用字段。

#### Scenario: finalizer 只看到用户可解释失败摘要
- **WHEN** runtime 因 invalid action、visible output validation、tool failure 或 repair limit 进入 terminal failure finalizer
- **THEN** finalizer input MUST 包含用户请求摘要、失败类别、blocked outputs、unmet requirements 和可恢复建议边界
- **AND** finalizer input MAY 包含脱敏内部诊断 code
- **AND** finalizer input MUST NOT 要求 finalizer 输出 `AgentAction`
- **AND** finalizer input MUST NOT 要求 finalizer 修复或引用内部 ID

## REMOVED Requirements

### Requirement: resource_missing repair 必须要求模型改正 usedRefs.resource.id
**Reason**: Planner 可见 terminal action 不再包含 `usedRefs.resource.id`。
**Migration**: 如果旧模型输出或 replay fixture 仍包含 resource ref，repair feedback 要求删除旧字段；服务端内部 provenance 由 runtime 记录。

### Requirement: missing_terminal_grounding_after_tool_result 必须通过 usedRefs 修复
**Reason**: 成功 terminal grounding 不再依赖模型手写 `usedRefs`。
**Migration**: 对结构化交付，模型应输出合法 `visibleOutputs[]`；对普通文本或澄清，runtime 自动记录 server-owned provenance 或 failure context。
