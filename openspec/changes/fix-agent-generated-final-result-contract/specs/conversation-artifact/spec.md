## ADDED Requirements

### Requirement: Agent 保存成功后必须产出合法 generated 终止结果
Agent 在生成 routine / plan artifact 并成功调用 `saveConversationArtifactRevision` 后，系统 SHALL 以本轮已登记保存结果为事实源产出合法 `AgentExecutionResult.generated`。如果模型在保存成功后返回缺少 `artifact`、`revisionId` 或 `validationId` 的 `final_result.generated`，系统 MUST NOT 丢弃已保存结果；在缺失字段可由当前 run 的保存 tool result 唯一确定时，系统 MUST 补齐结构化终止合同并继续执行最终投影。

#### Scenario: 保存成功后模型返回缺字段 generated
- **WHEN** Agent 已经成功调用 `saveConversationArtifactRevision`
- **AND** 保存结果包含 `artifactId`、`artifactKind`、`title`、`revisionId`、`validationId` 和 `policyDecisionId`
- **AND** 模型返回 `final_result.generated`
- **AND** 该结果缺少 `artifact`、`revisionId` 或 `validationId`
- **THEN** 系统 MUST 使用本轮保存 tool result 补齐 `artifact`、`revisionId`、`validationId` 和可用的 `policyDecisionId`
- **AND** 系统 MUST 继续执行 final result 引用校验
- **AND** 系统 MUST NOT 将该场景降级为 `model_output_invalid`

#### Scenario: 保存结果不足以补齐 generated
- **WHEN** 模型返回缺字段 `final_result.generated`
- **AND** 当前 run 没有成功的 `saveConversationArtifactRevision` 结果
- **OR** 保存结果缺少 `artifactId`、`artifactKind`、`title`、`revisionId` 或 `validationId`
- **THEN** 系统 MUST 保持 `AgentExecutionResult.generated` schema 严格
- **AND** 系统 MUST NOT 伪造 artifact summary 或保存结果
- **AND** 系统 MUST 返回结构化失败或继续既有可恢复流程

#### Scenario: Prompt 描述 generated 完整合同
- **WHEN** 系统请求模型做 Agent final result 决策
- **THEN** prompt MUST 给出 `generated` 终止结果的完整字段形态
- **AND** 该形态 MUST 包含 `artifact`、`revisionId`、`validationId` 和 `usedToolResultIds`
