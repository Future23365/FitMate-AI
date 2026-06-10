## MODIFIED Requirements

### Requirement: 默认 prompt 必须用短 JSON 形状表达 AgentAction 字段
系统 SHALL 在默认 Agent LLM prompt、`actionContract` 或等价模型可见输入中，用短 JSON 形状表达当前允许的 `AgentAction` 类型和字段。该形状 MUST 与 Planner 可见 schema 一致，并 MUST NOT 要求模型输出内部 grounding、tool result、ResourceStore 或历史事实引用 ID。

#### Scenario: Prompt 展示新的最小 AgentAction 形状
- **WHEN** production Planner 构造模型可见协议层
- **THEN** 模型可见输入 MUST 包含 `tool_call`、`final_answer` 和 `ask_user` 的最小合法 JSON 形状
- **AND** `tool_call` 示例 MUST 只包含 `type`、`toolName`、`input` 和可选活动摘要
- **AND** `final_answer` 示例 MUST 只包含 `type`、`content`、可选 `suggestedQuestions`、可选 `visibleOutputs` 和可选活动摘要
- **AND** `ask_user` 示例 MUST 只包含 `type`、`content`、可选 `suggestedQuestions` 和可选活动摘要
- **AND** 示例 MUST NOT 包含 `usedRefs`、`usedToolResultIds`、`usedResourceRefs`、`consumes`、`resourceId`、`toolResultId`、`factRef` 或 `messageId`

#### Scenario: Prompt 说明内部 provenance 由服务端维护
- **WHEN** prompt、`actionContract`、glossary 或 planner policy 描述 final grounding
- **THEN** 模型可见说明 MUST 表达模型只输出业务 action 和业务结构
- **AND** 模型可见说明 MUST 表达服务端内部负责记录 tool results、ResourceStore resource、history fact provenance、visible output validation metadata 和 trace
- **AND** 模型可见说明 MUST NOT 要求模型复制、选择、拼接或修复 `resourceId`、`toolResultId`、`factRef` 或 `messageId`
- **AND** 模型可见说明 MUST 使用中文描述业务含义，`AgentAction`、`tool_call`、`final_answer`、`ask_user`、`visibleOutputs` 等技术标识保持英文原样

## ADDED Requirements

### Requirement: 模型可见输入不得暴露可操作内部引用 ID
系统 SHALL 将 `toolResults`、`observations`、resource 摘要、history fact 摘要和 compressed tool results 投影为模型可消费的业务事实。模型可见内容 MAY 包含业务对象的稳定标识，例如数据库 `exerciseId`；MUST NOT 暴露可被模型复制到 action 的 `toolResultId`、`resourceId`、`factRef`、`messageId` 或 trace id。

#### Scenario: toolResults projection 使用业务事实而非引用操作
- **WHEN** adapter 构造 production Planner 的当前事实层
- **THEN** `toolResults[]` 或等价事实投影 MUST 保留模型判断下一步所需的业务事实、成功/失败状态、约束和诊断摘要
- **AND** 投影 MUST NOT 要求模型在最终 action 中引用 `toolResultId`
- **AND** 如 trace 仍记录 `toolResultId`，该字段 MUST 留在 trace / server metadata，不作为模型输出合同的一部分

#### Scenario: history facts projection 不暴露源业务引用
- **WHEN** 当前会话历史 `visibleTrainingProposal` 事实进入模型可见输入
- **THEN** projection MUST 使用受控压缩业务事实表达 `proposalKind`、section 摘要、`exerciseItems`、`prescription`、`schedule` 和必要动作详情
- **AND** projection MUST NOT 暴露 `factRef`、`messageId`、`resourceId` 或 `toolResultId`
- **AND** projection MUST 表达这些事实来自当前 actor 和 conversation 可访问边界，但不要求模型输出来源 ID

### Requirement: actionContract 必须表达 visibleOutputs 是结构化交付通道
系统 SHALL 在 `actionContract`、output contract 或 planner policy 中表达：结构化用户可见结果通过 `final_answer.visibleOutputs[]` 交付；该结构通过 terminal output validator 后即可作为成功交付依据。模型不需要额外输出 `usedRefs` 来证明同一个 `visibleOutputs[]`。

#### Scenario: visibleOutputs 成功不需要 usedRefs
- **WHEN** 模型可见合同描述 `final_answer.visibleOutputs[]`
- **THEN** 合同 MUST 表达 `visibleOutputs[]` 是结构化交付字段
- **AND** 合同 MUST 表达 `visibleOutputs[]` 会由服务端基于 `outputType`、`schemaVersion` 和业务 validator 校验
- **AND** 合同 MUST NOT 要求同一个 `final_answer` 同时输出 `usedRefs`

## REMOVED Requirements

### Requirement: 默认 prompt 必须区分 business reference 与 current-run resourceId
**Reason**: 模型不再输出 `usedRefs.resource.id`，也不再需要区分 `factRef`、`messageId` 和 current-run `resourceId` 的可输出位置。
**Migration**: 模型可见内容不得暴露可复制内部引用 ID；如需历史事实，服务端通过 tool 投影受控业务事实。
