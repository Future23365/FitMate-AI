## ADDED Requirements

### Requirement: Artifact hybrid search 必须区分肯定和否定器械约束

系统 SHALL 在 artifact hybrid search 中区分用户当前消息的肯定器械条件和否定器械条件，避免被否定器械成为正向召回或排序加分依据。

#### Scenario: 否定器械不贡献正向文本分
- **WHEN** artifact search query 来自“`不用哑铃了，换一个`”或等价否定器械表达
- **THEN** 搜索层 MUST NOT 因候选包含“哑铃”而增加正向 textScore
- **AND** rerank reasons MUST NOT 将被否定器械记录为正向“全文匹配”原因
- **AND** trace MUST 能显示该器械词被作为否定约束处理

#### Scenario: 违反否定约束的候选降权或过滤
- **WHEN** 当前搜索上下文包含否定器械约束
- **AND** artifact 候选的标题、摘要、结构化 equipment、exerciseIds 或 embeddingText 明显包含被否定器械
- **THEN** 搜索层 MUST 对该候选降权、过滤或标记为 constraint_mismatch
- **AND** 当前会话符合约束的候选 MUST 优先于跨会话违反约束的候选

#### Scenario: 肯定器械仍可正常匹配
- **WHEN** 用户明确表达有哑铃、想找哑铃训练或等价肯定器械条件
- **THEN** artifact hybrid search MAY 将哑铃作为正向文本和向量匹配信号
- **AND** 系统 MUST NOT 因新增否定约束处理破坏肯定器械检索场景

