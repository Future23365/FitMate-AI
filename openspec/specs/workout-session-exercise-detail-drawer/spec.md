# workout-session-exercise-detail-drawer Specification

## Purpose

定义 `/training` 训练执行页当前动作详情入口的交互规则，包括左侧动作示范模块入口、打开详情时自动暂停训练流程，以及复用共享动作详情抽屉的展示行为。

## Requirements

### Requirement: Training page can open current exercise details
训练中页面 MUST 在左侧当前动作示范模块提供“动作详情”入口，用户点击后 MUST 打开右侧动作详情抽屉，并展示当前训练动作的详情内容。

#### Scenario: Open detail drawer for current exercise
- **WHEN** 用户在 `/training` 当前动作示范模块点击“动作详情”
- **THEN** 系统 MUST 打开右侧动作详情抽屉
- **AND** 抽屉 MUST 展示当前训练动作的名称、图片动画和动作详情信息

### Requirement: Detail drawer pauses the active workout flow
系统 MUST 在用户打开当前动作详情抽屉时暂停当前训练流程，暂停范围 MUST 覆盖计时动作、计次动作、准备倒计时和语音播报推进。

#### Scenario: Pause flow when detail drawer opens
- **WHEN** 当前训练流程正在进行且用户点击“动作详情”
- **THEN** 系统 MUST 将训练流程切换为暂停状态
- **AND** 当前动作的剩余时间、已完成次数或准备倒计时 MUST 停止推进

#### Scenario: Preserve paused state after drawer closes
- **WHEN** 用户关闭已经打开的动作详情抽屉
- **THEN** 系统 MUST 保持训练流程为暂停状态
- **AND** 用户 MUST 通过现有“继续”操作恢复训练

### Requirement: Detail drawer reuses shared exercise preview behavior
训练中页面 MUST 复用现有共享动作详情抽屉能力，保持与动作编排、计划草稿或推荐卡片中的动作详情抽屉一致的右侧打开动画、图片轮播和详情布局。

#### Scenario: Reuse shared preview presentation
- **WHEN** 当前动作详情抽屉打开
- **THEN** 抽屉 MUST 使用共享动作详情抽屉的展示方式
- **AND** 不得新增与共享抽屉视觉和动画不一致的独立详情面板
