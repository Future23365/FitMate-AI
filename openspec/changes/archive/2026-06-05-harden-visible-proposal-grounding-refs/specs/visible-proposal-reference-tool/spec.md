## ADDED Requirements

### Requirement: run metadata 不得暴露可复制的 visibleTrainingProposal 业务引用
系统 SHALL 在 `/api/chat` 构造 `AgentRunInput` 时，将 `run.metadata.recentVisibleTrainingProposals` 投影为不含具体 `factRef` 和 `messageId` 的轻量状态摘要。该 metadata MAY 表达最近可见方案的 kind、status、schemaVersion、createdAt、proposalKind、section 摘要和可复用 training 数量；MUST NOT 暴露可被模型复制为 `read_recent.ref.value` 或 `final_answer.usedRefs.resource.id` 的具体业务引用值。

#### Scenario: metadata summary 不包含 factRef/messageId
- **WHEN** 当前 actor 和 conversation 存在最近用户可见 `visibleTrainingProposal` 事实
- **AND** `/api/chat` 构造生产 `AgentRunInput`
- **THEN** `run.metadata.recentVisibleTrainingProposals[]` MUST NOT 包含 `factRef`
- **AND** `run.metadata.recentVisibleTrainingProposals[]` MUST NOT 包含 `messageId`
- **AND** metadata MUST NOT 包含完整 `exerciseItems`、`prescription`、`schedule`、`exerciseDetails` 或动作图片详情
- **AND** 如模型需要具体引用，MUST 通过本轮 `inspectVisibleTrainingProposals(operation = "list_recent")` 获取

### Requirement: list_recent 索引引用不得作为 terminal resource grounding
`inspectVisibleTrainingProposals(operation = "list_recent")` SHALL 继续返回当前 run 可见的 `factRef/messageId` 轻量索引，但模型可见说明 MUST 表达这些引用只可用于本轮 `read_recent.ref.value`。系统 MUST NOT 将 `list_recent` 索引引用视为当前 run registered `resourceId`。

#### Scenario: list_recent observation 表达 resourceId 边界
- **WHEN** `list_recent` 返回 `facts[]`
- **THEN** model observation MUST 表达 `facts[].factRef` 和 `facts[].messageId` 只可复制到 `inspectVisibleTrainingProposals(operation = "read_recent").ref.value`
- **AND** model observation MUST 表达这些值不是 `final_answer.usedRefs.resource.id`
- **AND** list_recent 的 diagnostic resource MUST NOT 支撑成功训练方案刷新、替换、调整或新训练方案生成
