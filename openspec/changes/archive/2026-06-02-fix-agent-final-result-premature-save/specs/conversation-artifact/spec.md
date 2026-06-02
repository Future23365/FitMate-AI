## ADDED Requirements

### Requirement: Agent 保存前不得以 generated 终止
Agent 在生成或修订 routine / plan artifact 时，系统 SHALL 只有在已成功保存 `ConversationArtifact` 或 artifact revision 并获得 `revisionId` 后，才允许以 `generated` 或 `patched` 终止。若模型在保存前提前输出缺少保存结果的 `final_result`，系统 MUST 将该错误视为可恢复决策反馈，继续推进保存工具链。

#### Scenario: Policy 通过后模型提前返回 generated
- **WHEN** Agent 已经获得 `draftId`
- **AND** Agent 已经获得通过的 `validationId`
- **AND** Agent 已经获得允许写入的 `policyDecisionId`
- **AND** Agent 尚未获得 `saveConversationArtifactRevision` 返回的 `revisionId`
- **AND** 模型输出缺少 `artifact`、`revisionId` 或 `validationId` 的 `final_result.generated`
- **THEN** 系统 MUST NOT 将该结果投影为用户可见生成成功
- **AND** 系统 MUST 将该非法终止记录为可见的决策反馈
- **AND** 系统 SHOULD 继续下一轮 Agent 决策，使模型可以调用 `saveConversationArtifactRevision`

#### Scenario: 保存成功后允许 generated
- **WHEN** Agent 已经成功调用 `saveConversationArtifactRevision`
- **AND** 保存结果包含 `revisionId`、`artifactId`、`artifactKind`、`validationId` 和 `policyDecisionId`
- **THEN** 模型返回的 `final_result.generated` MUST 引用这些已登记资源
- **AND** 系统 MAY 将该结果投影为用户可见训练编排卡片
