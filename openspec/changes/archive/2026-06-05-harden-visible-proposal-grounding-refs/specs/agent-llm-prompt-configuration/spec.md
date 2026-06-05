## ADDED Requirements

### Requirement: 默认 prompt 必须区分 business reference 与 current-run resourceId
系统 SHALL 在默认 Agent LLM prompt 中说明 `final_answer.usedRefs.resource.id` 和 `ask_user.usedRefs.resource.id` 必须引用当前 run 已登记的 `resourceId`。Prompt MUST 明确业务对象 id、历史 `messageId`、示例 id、正文 id、`factRef` 或其他跨轮引用值不能当作 `resourceId` 使用。

#### Scenario: resource grounding 来源可见
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `resource` 引用里的 `id` 必须是当前 run registered `resourceId`
- **AND** system message SHOULD 说明 registered `resourceId` 通常来自 tool result 的 `fulfillment.producedResources[].resourceId`
- **AND** system message MUST 说明如果事实来自 satisfied tool result，模型可以优先使用 `usedRefs: [{ type: "tool_result", id: "..." }]`
- **AND** system message MUST NOT 鼓励模型复制 metadata、历史消息或 tool 示例中的业务 id 作为 resource id

### Requirement: 默认 prompt 必须表达 recentVisibleTrainingProposals 的非引用边界
系统 SHALL 在默认 prompt 中说明 `run.metadata.recentVisibleTrainingProposals` 只是不含具体引用 id 的最近可见训练方案状态摘要。该 metadata MUST NOT 被描述为 `read_recent` input 来源、`exerciseId` 来源或 terminal resource grounding 来源。

#### Scenario: metadata 不能作为 read_recent 输入
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `run.metadata.recentVisibleTrainingProposals` 不包含可复制的具体 `factRef/messageId`
- **AND** system message MUST 说明 `inspectVisibleTrainingProposals(operation = "list_recent")` 才会返回本轮可复制到 `read_recent.ref.value` 的引用索引
- **AND** system message MUST 说明 `list_recent` 仍不能直接作为 `exerciseId` 来源或成功训练方案事实源
