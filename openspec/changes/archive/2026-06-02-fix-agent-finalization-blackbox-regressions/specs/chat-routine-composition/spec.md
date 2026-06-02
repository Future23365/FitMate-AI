## MODIFIED Requirements

### Requirement: Routine 生成必须由 Agent draft 工具触发

系统 SHALL 让聊天 routine 生成从 Agent routine draft / validation / policy / persistence 工具链触发，而不是从旧聊天意图、内部动作事件或 `workoutIntent` 触发。首次生成 routine 时，工具链 SHALL 能创建新的 conversation artifact；修改已有 routine 时才需要 source artifact revision。

#### Scenario: 用户请求单次训练
- **WHEN** Agent 判断用户请求应生成单次 routine
- **THEN** Agent MUST 通过 routine draft 工具、候选集合、Validator 和 Policy 形成可展示结果
- **AND** `AgentExecutionResult` MUST 引用对应 tool result、validationId、policyDecisionId 或 revisionId
- **AND** 系统 MUST NOT 通过旧 `workout_routine` intent 字段独立触发 routine 卡片

#### Scenario: 首次生成 routine
- **WHEN** 本轮 Agent 已生成并校验新的 routine draft
- **AND** 当前会话没有可作为 revision source 的 routine artifact
- **THEN** 保存工具 MUST 创建新的 `ConversationArtifact(kind = "routine")`
- **AND** artifact MUST 归属于当前 `userId` 和 `sessionId`
- **AND** 系统 MUST NOT 因缺少 `sourceArtifactId` 将首次生成降级为自由文本回答

#### Scenario: 修改已有 routine
- **WHEN** 本轮 Agent 基于已有 routine artifact 生成修订或 patch
- **THEN** 保存工具 MUST 校验 source artifact 可访问且 active
- **AND** 保存结果 MUST 创建新的 revision
- **AND** 系统 MUST NOT 覆盖旧 artifact payload
