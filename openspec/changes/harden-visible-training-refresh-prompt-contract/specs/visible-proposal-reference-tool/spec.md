## ADDED Requirements

### Requirement: inspectVisibleTrainingProposals 模型说明必须支持训练方案刷新判断
`inspectVisibleTrainingProposals` 的模型可见说明 SHALL 表达该 tool 能读取当前会话中用户已经看到的 `visibleTrainingProposal` 事实，使 Planner 可以了解上一套方案的结构和已展示动作，再自主决定是否查询替代动作、调整结构、澄清或失败收口。说明 MUST NOT 把任意固定自然语言短语写成强制 tool 调用条件。

#### Scenario: Manifest 描述刷新可用事实
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** `description`、`whenToUse`、schema description 或 examples MUST 说明该 tool 可用于读取上一套用户可见训练方案事实
- **AND** 说明 MUST 表达读取事实的业务用途包括了解上一套 `exerciseItems`、section 摘要和计划结构，用于后续自主规划
- **AND** 说明 MUST 使用中文描述业务含义，`inspectVisibleTrainingProposals`、`visibleTrainingProposal`、`exerciseItems`、`list_recent`、`read_recent` 保持英文原样

#### Scenario: Metadata 和 list_recent 仍只是索引
- **WHEN** 模型可见上下文包含 `run.metadata.recentVisibleTrainingProposals`
- **OR** Planner 调用 `operation = "list_recent"`
- **THEN** 模型可见说明 MUST 表达这些内容只提供可引用索引或摘要
- **AND** 模型可见说明 MUST 表达完整历史方案事实需要通过当前 run 可见的受控读取结果获得
- **AND** 模型可见说明 MUST NOT 鼓励模型从 metadata 或 `list_recent` 猜测完整 `exerciseItems`

#### Scenario: 不写固定短语强制调用
- **WHEN** 模型可见说明描述替换、刷新、省略表达、指代或上下文继续请求
- **THEN** 说明 MUST 表达由模型基于上下文、可见事实和 tool result 自主判断是否调用本 tool
- **AND** 说明 MUST NOT 表达成用户说“换一批”“重新来一套”“不要这个”或其他固定短语时必须调用本 tool
- **AND** 服务端 MUST NOT 根据这些短语选择 `list_recent` 或 `read_recent`

### Requirement: read_recent 成功结果必须说明可用于差异化刷新
`inspectVisibleTrainingProposals(operation = "read_recent")` 成功后的模型 observation SHALL 说明读取到的事实可以作为当前 run 中差异化刷新、动作保留、动作排除或结构调整的依据，但该 tool 本身不生成新方案。

#### Scenario: Observation 描述当前 run 事实用途
- **WHEN** `read_recent` 成功
- **THEN** 模型 observation MUST 表达该可见训练方案事实已经导入当前 run
- **AND** observation MUST 表达 Planner 可以基于其中已展示动作决定保留、排除、替换、查询新动作、调整结构、澄清或失败收口
- **AND** observation MUST 表达最终新方案仍必须由 `final_answer.visibleOutputs[]` 承载
- **AND** observation MUST NOT 表达该 tool 已经生成刷新后的方案
