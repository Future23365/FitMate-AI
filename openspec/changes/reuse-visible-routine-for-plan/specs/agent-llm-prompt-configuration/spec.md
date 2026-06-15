## ADDED Requirements

### Requirement: 默认 prompt 必须表达历史训练事实派生计划的停止条件
系统 SHALL 在默认 Agent LLM prompt 中表达：当当前 run 可见事实已经提供可消费的训练动作、section 和 prescription，且目标只需要周期日程时，模型可以停止动作查询并进入结构化训练收口。Prompt MUST 使用稳定事实覆盖条件表达该规则，MUST NOT 使用用户固定短语、关键词、正则、同义词表、具体业务 toolName 或字段组合替模型决定下一步。

#### Scenario: 已有完整训练事实时停止动作查询
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 表达当前可见事实包括成功 tool result summary、已校验可见输出和通过只读导入工具导入的受控历史业务事实
- **AND** system message MUST 表达是否继续查询动作应取决于最终结构是否缺少动作事实、section 事实或 prescription 事实
- **AND** system message MUST 表达若已有可消费的 `exerciseItems`、`section` 和 `prescription`，且当前目标只缺周期内训练日 / 休息日安排，模型可以构造 `schedule` 并进入结构化训练收口
- **AND** system message MUST NOT 要求模型仅因输出类型从 `routine` 派生成 `plan` 就重新查询动作

#### Scenario: schedule 不被误认为动作库事实
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 表达 `schedule` 是 `plan` 的日程结构字段
- **AND** system message MUST 表达 `schedule` 不要求来自动作库查询结果
- **AND** system message MUST 表达缺少 `schedule` 不等价于缺少动作事实

#### Scenario: 不新增固定业务流程
- **WHEN** 实现本 prompt change
- **THEN** `/api/chat`、LangChain runtime、tool handler、validator 和 response adapter MUST NOT 新增基于用户原文短语、关键词、正则、同义词表或业务 `toolName` 的语义分支
- **AND** system message MUST NOT 包含原始失败用户短句或等价固定短语作为触发规则
