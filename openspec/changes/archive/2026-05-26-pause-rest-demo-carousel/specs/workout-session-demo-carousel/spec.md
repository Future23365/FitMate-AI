## MODIFIED Requirements

### Requirement: Rest step demo preview
系统 SHALL 在休息步骤中通过静止的视觉示范帮助用户准备下一个训练动作，同时不改变休息计时。

#### Scenario: Rest step has next action
- **WHEN** 当前时间线步骤是休息步骤并且存在下一个动作
- **THEN** 动作示范区域显示下一个动作的示范图
- **AND** 示范图固定为下一个动作的准备预览图，不随休息倒计时轮换
- **AND** 示范区域提示这是下一个动作或下一组动作
- **AND** 休息计时和休息语音提示继续描述当前休息步骤

#### Scenario: Rest step has no next action
- **WHEN** 当前时间线步骤是没有下一个动作的休息步骤
- **THEN** 动作示范区域回退到最相关的已完成动作或占位内容
- **AND** 示范图不随休息倒计时轮换
