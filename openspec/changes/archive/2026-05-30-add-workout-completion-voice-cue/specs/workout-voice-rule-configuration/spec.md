## ADDED Requirements

### Requirement: Completion cue configuration
系统 SHALL 在训练语音播报配置中定义训练完成提示的文案模板和调度策略，使完成提示与动作准备、倒计时、休息、计次等 cue 使用同一套配置边界。

#### Scenario: Developer adjusts completion wording
- **WHEN** 开发者更新训练完成 cue 的配置模板
- **THEN** 训练完成播报 MUST 使用更新后的模板文案
- **AND** 页面组件 MUST NOT 直接硬编码完成播报文本

#### Scenario: Completion cue policy is configured
- **WHEN** 训练完成 cue 被调度
- **THEN** scheduler MUST 使用配置中的完成 cue 优先级、打断策略、入队策略和过期时间
- **AND** 默认策略 MUST 允许完成 cue 打断旧步骤提示、倒计时和计次提示
