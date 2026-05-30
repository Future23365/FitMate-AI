## ADDED Requirements

### Requirement: AI 修改未来安排不得影响已完成训练执行记录
系统 SHALL 在 AI 修改 future schedule 后继续保护已完成 schedule 和 WorkoutSessionResult，训练执行页只读取当前有效的未来或待开始安排。

#### Scenario: future schedule Patch 命中历史和未来
- **WHEN** 用户要求“后面都别安排俯卧撑”
- **AND** 匹配结果包含已完成训练和未来训练
- **THEN** 系统 MUST 只修改未来训练安排
- **AND** 训练执行页 MUST 保持已完成训练记录不变
- **AND** 已完成训练 MUST 仍按原结果展示

### Requirement: 训练执行入口必须识别被 AI 重排后的安排
系统 SHALL 在 future schedule 被移动、取消或重排后，让训练执行入口读取最新 active schedule。

#### Scenario: 训练日被移动
- **WHEN** AI 将某个 future schedule 从原日期移动到新日期
- **THEN** 原日期 MUST 不再进入该训练执行入口
- **AND** 新日期 MUST 能打开移动后的训练安排
- **AND** 页面 MUST 不从旧 artifact preview 推断训练内容
