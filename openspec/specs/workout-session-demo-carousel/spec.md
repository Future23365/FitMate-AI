# workout-session-demo-carousel Specification

## Purpose

定义 `/training` 训练执行页的动作示范图展示规则，包括训练动作保留完整示范图、计次动作循环展示、计时动作默认展示最后一张图、休息步骤预览和缺图降级。

## Requirements

### Requirement: Workout item demo images
系统 SHALL 为训练执行页使用的训练动作保留所有可用示范图。

#### Scenario: Exercise is converted to workout item
- **WHEN** 带有多个 `imageUrls` 的动作被加入训练
- **THEN** 生成的训练动作包含这些示范图 URL
- **AND** 训练动作仍然暴露主图 `imageUrl`

#### Scenario: Existing workout item has only primary image
- **WHEN** 训练动作不包含 `imageUrls`
- **THEN** 系统从 `imageUrl` 派生一个单项图片列表

### Requirement: Workout session demo carousel
系统 SHALL 在 `/training` 根据当前动作模式展示当前相关动作的示范图。

#### Scenario: Timed exercise is active
- **WHEN** 当前时间线步骤是带有多张示范图的动作步骤
- **AND** 该动作使用 duration 模式
- **THEN** 动作示范区域默认展示最后一张示范图
- **AND** 该计时步骤内示范图不会独立循环

#### Scenario: Repetition exercise is active
- **WHEN** 当前时间线步骤是带有多张示范图的计次动作
- **THEN** 动作示范区域根据计算出的计次节奏循环展示全部示范图
- **AND** 用户进入另一个步骤时，图片序列重置

#### Scenario: Preparation countdown is active
- **WHEN** 当前动作正在等待准备语音提示或准备倒计时
- **THEN** 动作示范区域按动作模式显示当前动作的示范图
- **AND** 准备期间训练步骤计时不推进

#### Scenario: Training is paused
- **WHEN** 用户暂停训练
- **THEN** 当前可见示范图保持与暂停时的步骤时间对齐
- **AND** 示范图不会独立继续推进

#### Scenario: User changes step
- **WHEN** 用户点击上一个、下一个、跳过，或从训练列表选择动作
- **THEN** 动作示范区域立即切换到新的相关动作
- **AND** 计次动作示范图从该动作序列开头开始
- **AND** 计时动作示范图默认显示最后一张图

### Requirement: Rest step demo preview
系统 SHALL 在休息步骤中通过视觉示范帮助用户准备下一个训练动作，同时不改变休息计时。

#### Scenario: Rest step has next action
- **WHEN** 当前时间线步骤是休息步骤并且存在下一个动作
- **THEN** 动作示范区域显示下一个动作的示范图
- **AND** 休息计时和休息语音提示继续描述当前休息步骤

#### Scenario: Rest step has no next action
- **WHEN** 当前时间线步骤是没有下一个动作的休息步骤
- **THEN** 动作示范区域回退到最相关的已完成动作或占位内容

### Requirement: Demo image fallback
系统 SHALL 在示范图不完整或不可用时保持训练执行页可用。

#### Scenario: Action has one demo image
- **WHEN** 当前相关动作只有一个图片 URL
- **THEN** 动作示范区域显示该图片，且不出现轮播错误

#### Scenario: Action has no usable demo image
- **WHEN** 当前相关动作没有可用图片 URL
- **THEN** 动作示范区域显示现有 fallback illustration 或占位图
