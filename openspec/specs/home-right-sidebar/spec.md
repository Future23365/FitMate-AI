# home-right-sidebar Specification

## Purpose
TBD - created by archiving change remove-home-right-exercise-recommendation. Update Purpose after archive.
## Requirements
### Requirement: 首页右侧栏不展示独立动作推荐模块
首页右侧栏 SHALL 不再展示独立的“动作推荐”标题、空状态卡片或个性化动作推荐占位文案。

#### Scenario: 打开首页聊天
- **WHEN** 用户打开首页聊天页
- **THEN** 右侧栏 MUST 展示今日训练概览、本周计划和训练小贴士
- **AND** 右侧栏 MUST NOT 展示独立“动作推荐”模块

#### Scenario: 聊天消息包含动作推荐
- **WHEN** 聊天消息生成动作推荐卡片
- **THEN** 系统 MUST 继续在聊天消息气泡内展示动作推荐卡片
- **AND** 右侧栏 MUST NOT 因该消息新增独立动作推荐占位

