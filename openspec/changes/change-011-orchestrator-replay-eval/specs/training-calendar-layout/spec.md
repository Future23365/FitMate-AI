## ADDED Requirements

### Requirement: 日历必须展示 AI 修改后的真实未来安排
系统 SHALL 在 AI 写入 future schedule 后，从服务端真实 schedule 状态展示日历，而不是仅展示聊天 artifact preview。

#### Scenario: AI 批量重排未来训练
- **WHEN** 用户确认改变周频率或重排未来训练日
- **THEN** 训练日历 MUST 展示更新后的训练日、休息日和受影响日期
- **AND** 日历 MUST 区分已完成历史和未来可修改安排

### Requirement: 日历操作结果必须保留可理解的变更摘要
系统 SHALL 在日历或相关详情区域提供 AI 修改的摘要来源，使用户能理解哪些日期被移动、取消或新增。

#### Scenario: 标记明天为休息日
- **WHEN** AI 将明天的 future schedule 改为休息日
- **THEN** 日历 MUST 反映明天为休息或无训练安排
- **AND** 如果原训练被顺延，日历 MUST 展示新的训练日期
- **AND** 用户 MUST 能看到本次修改的简短摘要
