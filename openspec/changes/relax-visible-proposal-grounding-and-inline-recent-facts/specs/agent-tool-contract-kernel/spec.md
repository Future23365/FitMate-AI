## MODIFIED Requirements

### Requirement: AgentAction 必须经过确定性校验
系统 SHALL 定义 Planner 可见 `AgentAction` Schema，并在执行前校验 `tool_call`、`final_answer` 和 `ask_user` 的结构与可执行边界。Planner 可见 `AgentAction` SHALL 只承载模型需要表达的业务动作；服务端内部 grounding、tool result provenance、ResourceStore resource 和 trace 引用 SHALL 由 runtime 维护，不作为模型必须输出或修复的字段。

#### Scenario: 合法 final_answer terminal action 不需要模型手写 usedRefs
- **WHEN** Planner 返回 `final_answer`
- **THEN** action MUST 包含用户可见 `content`
- **AND** action MAY 包含 `suggestedQuestions`
- **AND** action MAY 包含通过静态 envelope 和业务 validator 校验的 `visibleOutputs[]`
- **AND** action MUST NOT 需要 `usedRefs`、`usedToolResultIds`、`usedResourceRefs`、`resourceId` 或 `toolResultId`
- **AND** validator MUST NOT 因本轮存在 tool result 而要求 Planner 手写 current-run grounding refs
- **AND** runtime MAY 在内部 trace、result metadata 或 server-owned provenance 中记录该 terminal action 关联的 tool results、visible output validation metadata 或 failure context

#### Scenario: 合法 ask_user terminal action 不需要模型手写 usedRefs
- **WHEN** Planner 返回 `ask_user`
- **THEN** action MUST 包含用户可见 `content`
- **AND** action MAY 包含 `suggestedQuestions`
- **AND** action MUST NOT 需要 `usedRefs`、`resourceId`、`toolResultId`、`factRef` 或 `messageId`
- **AND** runtime MAY 在内部 trace 中记录导致澄清的 diagnostic facts

#### Scenario: tool_call 不允许模型手写 resource consumption refs
- **WHEN** Planner 返回 `tool_call`
- **THEN** action MUST 包含已注册 `toolName` 和匹配该 tool input schema 的 `input`
- **AND** Planner-visible action MUST NOT 暴露 `consumes`、`resourceId`、`toolResultId` 或等价 resource 引用字段
- **AND** 如果某个 tool 需要当前 run resource，服务端 MUST 通过 tool handler、ResourceStore、actor context、runtime context 或受控业务输入选择可消费资源
- **AND** 模型不得把 `factRef`、`messageId`、历史业务对象 id 或 trace id 当作 resource 引用传入 tool

#### Scenario: 旧 terminal 引用字段被拒绝
- **WHEN** Planner 返回的 `final_answer`、`ask_user` 或 `tool_call` 包含 `usedRefs`、`usedToolResultIds`、`usedResourceRefs`、`consumes`、`resourceId`、`toolResultId`、`factRef` 或 `messageId` 等旧内部引用字段
- **THEN** schema 或 validator MUST 拒绝该 action 或剥离到脱敏 diagnostic
- **AND** repair feedback MUST 要求模型删除旧字段或改用业务结构
- **AND** repair feedback MUST NOT 要求模型补一个正确的内部 ID

### Requirement: ResourceStore 必须保持服务端内部事实边界
系统 SHALL 继续使用 `ResourceStore` 或等价机制维护当前 run 内的受控资源事实。ResourceStore 的 resource id、role、sourceToolResultId 和 inventory SHALL 保持服务端内部机制，用于权限、tool handler、trace、replay 和 provenance；这些字段 MUST NOT 成为 Planner 必须输出、复制或修复的模型可见合同。

#### Scenario: Runtime 内部登记可消费资源
- **WHEN** tool handler 或 runtime 导入历史训练方案、候选集合或其他可消费事实
- **THEN** 服务端 MAY 在 `ResourceStore` 中登记 resource
- **AND** resource MUST 绑定当前 run、source tool result、resource type、role 和受控 summary
- **AND** registered resource id MUST NOT 暴露为模型需要在 `AgentAction` 中复制的字段

#### Scenario: 内部 resource 不绕过业务 validator
- **WHEN** server-owned resource 被用于后续 tool handler、visible output validation、trace 或 persistence
- **THEN** 服务端 MUST 继续校验权限、schemaVersion、状态、resource type 和 role
- **AND** `visibleTrainingProposal` 最终输出仍 MUST 通过数据库动作事实、payload、prescription 和 schedule 校验
- **AND** runtime MUST NOT 因 resource 曾经存在就绕过最终业务 validator

## REMOVED Requirements

### Requirement: Planner terminal action 必须使用 usedRefs 表达 grounding
**Reason**: `usedRefs` 要求模型手写内部 `toolResultId` 或 `resourceId`，会把服务端 provenance 暴露为模型输出合同，并导致业务正确结果因为引用协议失败而被拒绝。
**Migration**: Planner 可见 terminal action 不再包含 `usedRefs`；runtime 以 server-owned provenance 记录 terminal action 关联的 tool results、resources、visible output validation metadata 和 failure context。

### Requirement: read/import resource id 必须由 Planner 写入 tool_call consumes
**Reason**: 模型不应选择或复制 current-run `resourceId`。资源选择和消费属于服务端执行边界。
**Migration**: 需要历史事实或可消费资源的 tool 由服务端内部从 actor context、runtime context、ResourceStore 或受控业务输入读取，不让 Planner 手写 `consumes`。
