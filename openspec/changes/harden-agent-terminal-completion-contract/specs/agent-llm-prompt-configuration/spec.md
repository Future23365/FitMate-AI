## ADDED Requirements

### Requirement: 默认 prompt 必须表达 final_answer 的终态完成语义
系统 SHALL 在默认 Agent LLM prompt 中表达 `final_answer` 是当前 run 的终态动作。Prompt MUST 说明 `final_answer.content` 只能解释本轮已经完成、明确阻断或失败收口的结果；如果还需要执行 tool、查询事实、生成结构、保存结果或等待内部步骤，模型 MUST 返回合法 `tool_call`、`ask_user` 或失败收口。

#### Scenario: Prompt 说明 final_answer 不会触发后续 tool
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `final_answer` 是终态，不会让 runtime 在本轮回复后继续自动调用 tool
- **AND** system message MUST 使用中文描述业务含义
- **AND** `final_answer`、`tool_call`、`ask_user`、`visibleOutputs`、`usedToolResultIds` 和 `usedResourceRefs` 等技术标识 MUST 保持英文原样

#### Scenario: Prompt 禁止未执行步骤的成功承诺
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明模型不得用 `final_answer.content` 承诺尚未执行的查询、生成、保存、等待或后续内部动作
- **AND** system message MUST 说明需要继续获取事实时必须返回当前可见且合法的 `tool_call`
- **AND** system message MUST NOT 要求固定 tool 调用次数、固定 tool 调用顺序或固定业务 `toolName`

#### Scenario: Prompt 表达 tool 后 final_answer 的 grounding
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明当前 run 已经有 tool result 时，成功 `final_answer` 应通过 `usedToolResultIds`、`usedResourceRefs` 或合法 `visibleOutputs[]` 连接到当前 run 已满足事实
- **AND** system message MUST 说明 failed、diagnostic 或 `satisfied=false` 的 tool result 只能用于 `ask_user`、失败解释、阻断说明或下一轮 repair

#### Scenario: Prompt 保持普通文本聊天能力
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明普通聊天、概念解释、能力说明、总结整理、训练原则说明等不需要工具执行的问题仍可直接使用 `final_answer`
- **AND** system message MUST NOT 暗示所有 `final_answer` 都必须引用 tool result

#### Scenario: Prompt 不新增服务端隐藏业务能力
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 承诺服务端会自动补齐训练动作、自动生成训练编排、自动保存 artifact 或执行未注册 tool
- **AND** system message MUST NOT 要求调用 `generatePlanDraft` 或 `generateRoutineDraft`
