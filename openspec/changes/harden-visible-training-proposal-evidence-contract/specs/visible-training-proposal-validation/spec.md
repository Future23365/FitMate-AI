## ADDED Requirements

### Requirement: section 校验失败必须提供模型可恢复的结构化诊断
系统 SHALL 在 `visibleTrainingProposal.exerciseItems[*].section` 不存在于该动作 `allowedSections` 时，返回可进入 repair observation 的结构化诊断。诊断 MUST 表达失败字段路径、`exerciseId`、模型输出的 `section`、数据库允许的 `allowedSections` 和稳定错误 code。系统 MUST NOT 在该诊断中替 Planner 指定必须调用的具体 tool 或固定 tool 调用顺序。

#### Scenario: section 不合法时反馈字段级 violation
- **WHEN** Planner 返回 `final_answer.visibleOutputs[]`
- **AND** 其中某个 `visibleTrainingProposal.exerciseItems[0]` 的 `exerciseId = "Pushups"`
- **AND** 该动作数据库事实的 `allowedSections = ["training"]`
- **AND** Planner 输出 `section = "warmup"`
- **THEN** 系统 MUST 拒绝该 `visibleTrainingProposal`
- **AND** 拒绝结果 MUST 包含 `code = "section_not_allowed"`
- **AND** 拒绝结果 MUST 包含指向 `visibleOutputs[0].payload.exerciseItems[0].section` 或等价位置的 `path`
- **AND** 拒绝结果 MUST 包含 `exerciseId = "Pushups"`、`section = "warmup"` 和 `allowedSections = ["training"]`
- **AND** 拒绝结果 MUST NOT 生成 `visible_output` 用户事件
- **AND** 拒绝结果 MUST NOT 保存 `visible_training_proposal_displayed` 事实

#### Scenario: section 诊断不替模型选择下一步
- **WHEN** 系统因 `section_not_allowed` 生成 terminal output validation failure
- **THEN** 诊断内容 MUST 只表达确定性失败事实和合同边界
- **AND** 诊断内容 MUST NOT 包含“必须调用 `searchExerciseResources`”或等价固定流程要求
- **AND** 诊断内容 MUST NOT 根据用户原文关键词、正则、同义词表或短句模板改写 Planner 的下一步 action

