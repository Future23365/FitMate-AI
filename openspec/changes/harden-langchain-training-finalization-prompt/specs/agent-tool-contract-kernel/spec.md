## MODIFIED Requirements

### Requirement: 结构化训练输出必须由业务 tool 校验
系统 SHALL 通过 `submitVisibleTrainingProposal` 或等价业务 tool 提交训练方案结构。该 tool MUST 负责 visible output envelope、payload schema、数据库动作事实、section 边界、renderer 投影和 accepted/rejected 摘要，不得保存计划或解析自然语言。

#### Scenario: finalization tool description 表达训练结构收口边界
- **WHEN** production catalog 序列化 `submitVisibleTrainingProposal` description 或 schema description
- **THEN** description MUST 表达该 tool 用于提交模型已经构造好的结构化训练结果，并由服务端 validator 生成用户可见投影
- **AND** description MUST 表达该 tool 适用于训练动作集合、单次训练 routine 或多天训练 plan 的结构化收口
- **AND** description MUST 表达普通训练知识、动作教学、注意事项或筛选结果说明等纯文本回答不需要调用该 tool
- **AND** description MUST NOT 表达该 tool 会查询动作库、自动补全动作、保存计划、生成处方或替模型选择动作
- **AND** description MUST NOT 根据用户原文、关键词、短句模板、具体 `toolName` 结果或字段组合规定固定调用流程
