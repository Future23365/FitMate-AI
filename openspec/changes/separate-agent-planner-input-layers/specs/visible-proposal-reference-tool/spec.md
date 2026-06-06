## ADDED Requirements

### Requirement: read_recent ref 模型可见来源必须只指向本轮 list_recent
`inspectVisibleTrainingProposals(operation = "read_recent")` 的模型可见 schema description、manifest 说明和 examples SHALL 表达 `ref.value` 只能复制本轮 `list_recent` 返回的真实 `factRef` 或 `messageId`。Runtime MAY 继续通过当前 run diagnostic resource 校验可见性，但该实现细节 MUST NOT 作为 Planner 可选择的输入来源暴露。

#### Scenario: schema description 不暴露 diagnostic resource 作为输入来源
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** `read_recent.ref` 和 `read_recent.ref.value` 的模型可见 description MUST 表达只允许复制本轮 `list_recent` 返回的 `factRef` 或 `messageId`
- **AND** description MUST 表达没有真实返回值时先调用 `list_recent`、澄清或失败收口
- **AND** description MUST NOT 表达 Planner 可以从 `diagnostic index resource`、历史 assistant 消息、trace 摘要、示例或业务存储 id 猜测 `ref.value`

#### Scenario: read_recent examples 不提供可复制假引用
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** examples MUST 包含完整 `tool_call` action 形态
- **AND** examples MUST 至少包含 `operation = "list_recent"` 的合法调用
- **AND** 如果保留 `operation = "read_recent"` 示例，该示例 MUST 明确表达 `ref.value` 来自本轮 `list_recent` 的真实返回值
- **AND** examples MUST NOT 包含 `fact-1`、`fact_recent_visible_training_01` 或其他看起来像真实引用的 fake id

#### Scenario: handler 可见性校验不变
- **WHEN** Planner 调用 `operation = "read_recent"`
- **THEN** handler MUST 继续校验 `ref.value` 是否存在于当前 run 可见的 list index / diagnostic index resource
- **AND** handler MUST NOT 因模型可见说明收紧而接受 metadata-only 引用、历史消息文本引用或编造引用
- **AND** handler MUST NOT 读取跨用户、跨 conversation 或不可见事实

#### Scenario: repair feedback 指向 list_recent 恢复路径
- **WHEN** `read_recent` 因引用不可见、缺失或 schema 不合法被拒绝
- **THEN** repair feedback MUST 表达 `read_recent.ref.value` 只能来自本轮 `list_recent` 返回的真实 `factRef` 或 `messageId`
- **AND** repair feedback MUST NOT 伪造或补入具体引用值
- **AND** repair feedback MUST 允许 Planner 在剩余预算内改为合法 `list_recent`、合法 `read_recent`、`ask_user` 或失败收口
