## ADDED Requirements

### Requirement: 准确度优先阶段必须保留可消费候选事实
系统 SHALL 在准确度优先阶段为模型保留足够完整的受控候选事实，避免已经由业务 tool 查询到的动作候选、历史训练事实或失败诊断摘要因为过低预算而被截断成不可消费 preview。该要求 MUST 不改变模型事实来源边界；模型仍只能消费当前用户输入、成功 tool result summary、已验证可见输出或受控业务事实。

#### Scenario: searchExerciseResources 候选摘要不被低预算截断
- **WHEN** `searchExerciseResources` 返回配置允许范围内的候选事实
- **THEN** 模型可见摘要 MUST 包含可消费的 `candidateGroups`
- **AND** 摘要 MUST NOT 因旧的低长度预算或固定 20 项数组限制变成只有 preview 的 `status: "truncated"`

#### Scenario: 历史训练事实摘要不被低预算截断
- **WHEN** `inspectVisibleTrainingProposals` 返回配置允许范围内的最近 visibleTrainingProposal facts
- **THEN** 模型可见摘要 MUST 保留 facts、section coverage、可复用训练动作和 schedule 摘要
- **AND** 摘要 MUST NOT 因旧的低结构预算丢失配置允许范围内的事实项

#### Scenario: 准确度优先不新增语义分流
- **WHEN** 模型可见 payload 预算被调大
- **THEN** `/api/chat`、LangChain runtime、tool handler 和 validator MUST NOT 基于用户原文关键词、正则、同义词表或 phrasing 选择不同预算或改写 tool call
- **AND** 后续 token 优化 MUST 通过集中配置、摘要 schema 或受控压缩策略完成

#### Scenario: 聊天 raw message 上限同步放宽
- **WHEN** `/api/chat` 准备交给 LangChain Agent 的真实对话消息
- **THEN** 单条用户消息、单条历史消息和 deterministic conversation summary 的长度上限 MUST 使用共享上下文预算
- **AND** 客户端轻量上下文和服务端请求 schema MUST 使用同一组共享预算，避免客户端先丢弃服务端本可接受的长消息
