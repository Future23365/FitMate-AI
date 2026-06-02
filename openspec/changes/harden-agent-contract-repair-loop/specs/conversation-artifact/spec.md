## ADDED Requirements

### Requirement: Artifact 生成成功必须引用真实写工具结果
系统 SHALL 只有在当前 run 已成功执行 `saveConversationArtifactRevision` 或等价写工具，并获得可验证 `revisionId` 后，才允许 routine / plan artifact 以 `generated` 或 `patched` 状态终止。

#### Scenario: 模型伪造 revisionId
- **WHEN** 模型返回 `final_result.generated` 或 `final_result.patched`
- **AND** 结果中的 `revisionId` 不属于当前 run 已登记的写工具结果
- **THEN** 系统 MUST 拒绝该成功状态
- **AND** 系统 MUST NOT 创建或展示成功训练 artifact 卡片
- **AND** 若已有可保存资源，系统 MUST 通过 `AgentDecisionFeedback` 推荐继续调用写工具

#### Scenario: 写工具保存成功
- **WHEN** `saveConversationArtifactRevision` 成功创建或修订 routine / plan artifact
- **THEN** 写工具结果 MUST 返回 `artifactId`、`revisionId`、`artifactKind`、`validationId` 和 `policyDecisionId`
- **AND** runtime MUST 将这些 id 登记到 dependency graph
- **AND** Response Writer MUST 只消费通过引用校验的 `AgentExecutionResult`

### Requirement: Artifact final result 结构化字段必须由服务端事实投影
系统 SHALL 以当前 run 已登记写工具结果作为 `AgentExecutionResult.generated` / `patched` 中 artifact summary、`revisionId`、`validationId` 和 `policyDecisionId` 的事实来源。

#### Scenario: 模型输出缺少保存字段
- **WHEN** 当前 run 已有唯一成功写工具结果
- **AND** 模型最终结果缺少 artifact summary、`revisionId`、`validationId` 或 `policyDecisionId`
- **THEN** runtime MAY 从写工具结果投影这些结构化字段
- **AND** 投影结果 MUST 继续通过当前 run 引用校验
- **AND** runtime MUST NOT 从模型自由文本或 `conversationSummary` 重建 artifact payload

#### Scenario: 多个写工具结果无法唯一确定
- **WHEN** 当前 run 中存在多个可能匹配的写工具结果
- **AND** 模型 final result 没有足够引用来唯一确定使用哪一个保存结果
- **THEN** runtime MUST NOT 猜测选择 artifact
- **AND** 系统 MUST 返回可恢复 feedback 或 failed 结果
