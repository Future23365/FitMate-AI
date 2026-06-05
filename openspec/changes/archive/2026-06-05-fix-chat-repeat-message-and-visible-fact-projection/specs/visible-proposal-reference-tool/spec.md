## MODIFIED Requirements

### Requirement: list_recent 必须只返回轻量事实索引
`inspectVisibleTrainingProposals(operation = "list_recent")` SHALL 返回当前可引用 `visibleTrainingProposal` 的轻量索引。`list_recent` MUST NOT 返回完整训练方案 payload，也 MUST NOT 产出当前 run 的 consumable resource。

#### Scenario: 返回最近可见训练方案索引
- **WHEN** `list_recent` 查询到当前 actor 和 conversation 可访问的事实
- **THEN** output MUST 使用 `status = "succeeded"` 和 `operation = "list_recent"`
- **AND** output MUST 包含 `facts[]`
- **AND** 每个 fact 摘要 MUST 至少包含 `factRef`、`messageId`、`proposalKind`、`status`、`visibleOutputSchemaVersion`、`factSchemaVersion`、section 摘要和可复用训练动作数量
- **AND** 如 output 包含 `reusableTrainingExercises[]`，字段范围 MUST 限制为 `exerciseId`、`order`、可展示名称和 section 摘要

#### Scenario: list_recent 不泄漏完整事实
- **WHEN** `list_recent` 返回 fact 摘要
- **THEN** output MUST NOT 包含完整 `visibleTrainingProposal.payload`
- **AND** output MUST NOT 包含完整 `prescription`、完整 `schedule`、完整 handler output、未进入用户可见方案的 tool 候选或跨用户数据
- **AND** output MUST NOT 暴露可被模型直接复制为新训练方案的完整动作事实

#### Scenario: run metadata 只暴露可见训练方案索引
- **WHEN** `/api/chat` 构造 `AgentRunInput`
- **AND** 当前 actor 和 conversation 存在最近可见训练方案事实
- **THEN** `run.metadata.recentVisibleTrainingProposals` MUST 只包含可引用索引摘要
- **AND** 每个摘要 MUST NOT 包含 `exerciseItems`、`prescription`、`schedule`、`exerciseDetails`、图片、肌群、器械或完整展示详情
- **AND** 需要完整方案事实时，模型 MUST 通过 `inspectVisibleTrainingProposals(operation = "read_recent")` 导入当前 run 的 `visible_training_proposal_fact`

#### Scenario: list_recent 空结果
- **WHEN** 当前 actor 和 conversation 没有可访问的可见训练方案事实
- **THEN** `list_recent` MUST 返回 `status = "succeeded"`、`operation = "list_recent"` 和空 `facts[]`
- **AND** fulfillment MUST 表示本次事实状态查询已完成
- **AND** 该结果 MUST 能作为模型解释当前没有可引用方案或向用户澄清的事实依据
- **AND** 该结果 MUST NOT 支撑成功训练方案生成
