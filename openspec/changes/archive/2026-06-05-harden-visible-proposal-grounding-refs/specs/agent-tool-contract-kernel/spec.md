## ADDED Requirements

### Requirement: terminal resource_missing 必须提供通用 grounding repair facts
系统 SHALL 在 terminal action 引用不存在的 current-run resource 时，将 `resource_missing` 投影为模型可见的通用 `domain_validation_failed` facts。该 feedback MUST 定位到 `usedRefs.resource.id`，并说明合法恢复来源是当前 run registered `resourceId`、satisfied tool result 或合法 `visibleOutputs`。Agent core MUST NOT 为具体业务 tool、用户短语、业务字段组合或 trace case 写 repair 分支。

#### Scenario: missing resource ref 返回字段级 repair details
- **WHEN** Planner 返回 `final_answer` 或 `ask_user`
- **AND** `usedRefs[]` 中包含 `type = "resource"` 的引用
- **AND** `ResourceStore` 中不存在该 `resourceId`
- **THEN** validator MUST 返回 `code = "resource_missing"`
- **AND** error details MUST 包含 `type = "domain_validation_failed"`
- **AND** details MUST 包含 `target.schemaId = "AgentAction"`
- **AND** details MUST 包含 `facts[]` 项，且 `path = "usedRefs.resource.id"`
- **AND** facts MUST 表达 expected 包括 `current_run_registered_resourceId`、`satisfied_tool_result_ref` 或 `valid_visibleOutputs`
- **AND** facts MUST NOT 包含具体业务 `toolName` 分支、用户自然语言短语、服务端语义改写或跨 run resource 自动导入

#### Scenario: repair feedback 不改变下一轮校验
- **WHEN** 模型收到 `resource_missing` repair facts 后重新输出 action
- **THEN** runtime MUST 继续校验 schema、resource、policy、grounding 和 terminal visible output
- **AND** runtime MUST NOT 因上一轮 feedback 已指出错误而接受未登记 resource
- **AND** runtime MUST NOT 自动把业务对象 id 或历史 message id 转换成 current-run `resourceId`
