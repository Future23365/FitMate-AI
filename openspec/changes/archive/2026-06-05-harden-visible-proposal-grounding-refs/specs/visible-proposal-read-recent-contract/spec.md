## ADDED Requirements

### Requirement: read_recent 必须只接受本轮索引暴露的引用
系统 SHALL 将 `inspectVisibleTrainingProposals(operation = "read_recent")` 的引用可见性限制为当前 run 中由 `list_recent` 产生的 tool result 或 `visible_training_proposal_fact_index` diagnostic resource。`read_recent` MUST NOT 从 `run.metadata.recentVisibleTrainingProposals`、历史 assistant 消息、示例、trace 摘要或业务存储 id 推断引用可见。

#### Scenario: metadata-only 引用被拒绝
- **WHEN** `run.metadata.recentVisibleTrainingProposals` 中存在最近可见训练方案状态摘要
- **AND** Planner 直接调用 `inspectVisibleTrainingProposals(operation = "read_recent")`
- **AND** 当前 run 尚未通过 `list_recent` 产生包含该引用的 diagnostic index resource
- **THEN** tool MUST 返回 `status = "failed"` 和 `code = "fact_reference_not_visible_in_run"`
- **AND** fulfillment MUST 表示 `satisfied = false`
- **AND** handler MUST NOT 读取 fact store
- **AND** runtime MUST NOT 登记 `visible_training_proposal_fact` consumable resource

#### Scenario: list_recent 后允许 read_recent
- **WHEN** Planner 先调用 `inspectVisibleTrainingProposals(operation = "list_recent")`
- **AND** list result 或 diagnostic index resource 中包含真实 `factRef` 或 `messageId`
- **AND** Planner 随后把该值复制到 `read_recent.ref.value`
- **THEN** `read_recent` MAY 读取该事实
- **AND** 成功时 MUST 将 `visible_training_proposal_fact` 登记为当前 run 的 consumable resource

### Requirement: read_recent 模型可见示例不得包含 fake 引用值
`inspectVisibleTrainingProposals` 的 production manifest examples SHALL NOT 包含可被模型照抄的 fake `factRef`、fake `messageId` 或 fake `read_recent.ref.value`。引用关系 SHALL 通过 schema description、whenToUse、whenNotToUse 和 observations 表达。

#### Scenario: examples 只展示安全 list_recent
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** examples MUST 包含合法 `operation = "list_recent"` 示例
- **AND** examples MUST NOT 包含 `operation = "read_recent"` 且带占位引用值的示例
- **AND** examples MUST NOT 包含 `fact-1`、`fact_recent_visible_training_01` 或等价占位业务引用
