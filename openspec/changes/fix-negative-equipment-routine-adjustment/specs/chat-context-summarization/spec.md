## ADDED Requirements

### Requirement: Summary 必须保存当前消息覆盖后的器械事实

系统 SHALL 在用户用当前消息覆盖历史器械条件后，将覆盖后的事实写入 `conversationSummary`，避免下一轮继续沿用旧器械条件。

#### Scenario: 用户取消哑铃
- **WHEN** previousSummary 或 recent artifact 表达用户使用哑铃
- **AND** 最新用户消息表达不用哑铃、不要哑铃、换成无器械或等价覆盖
- **AND** 本轮回复、Patch、重新生成或失败恢复已经消费该覆盖条件
- **THEN** 新的 `conversationSummary` MUST 表达当前器械条件已改为不使用哑铃或无哑铃
- **AND** 新 summary MUST NOT 将“器械：哑铃”继续描述为当前有效条件

#### Scenario: Summary 更新模型不可用
- **WHEN** summary 更新 LLM 失败、超时或返回不合格内容
- **AND** 本轮服务端内部动作摘要包含器械覆盖事实
- **THEN** 确定性 fallback summary MUST 保留该覆盖事实
- **AND** 聊天回复 MUST NOT 因 summary 更新失败而丢失本轮用户可见结果

#### Scenario: Trace 展示覆盖事实
- **WHEN** AI Trace 展示 summary 更新输入和输出
- **THEN** Trace MUST 能看出最新用户消息覆盖了历史器械条件
- **AND** Trace MUST NOT 仅展示旧 summary 中的哑铃条件而缺少覆盖结果
