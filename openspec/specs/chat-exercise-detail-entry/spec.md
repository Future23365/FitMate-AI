# chat-exercise-detail-entry Specification

## Purpose
TBD - created by archiving change unify-chat-exercise-detail-entry. Update Purpose after archive.
## Requirements
### Requirement: 聊天动作卡片统一详情入口
系统 SHALL 在聊天推送的单独动作推荐、单次动作编排和长期计划草稿中，为每个动作卡片提供统一的右上角详情入口。

#### Scenario: 三类动作卡片显示一致的详情按钮
- **WHEN** 聊天中展示单独动作推荐、单次动作编排或长期计划草稿动作卡片
- **THEN** 每个动作卡片 MUST 在右上角显示统一样式的 `info` 详情按钮
- **AND** 该按钮 MUST 使用低干扰默认样式，并在卡片 hover 或按钮 focus 时呈现更明显的可点击状态

#### Scenario: 详情只由按钮触发
- **WHEN** 用户点击动作卡片内容区域、动作名称、图片或训练参数
- **THEN** 系统 MUST NOT 打开动作详情抽屉
- **AND** 只有用户点击右上角详情按钮时，系统 MUST 打开对应动作的 `ExercisePreviewSheet`

#### Scenario: 详情入口保持紧凑卡片可读性
- **WHEN** 动作卡片处于两列紧凑布局且动作名称较长
- **THEN** 系统 MUST 保持动作名称、标签、器械或训练参数不与右上角详情按钮重叠
- **AND** 详情按钮 MUST NOT 使用可见文字挤占卡片主体空间

### Requirement: 详情语义与安全提醒分离
系统 SHALL 区分动作详情入口和安全提醒入口，不得使用 warning/叹号样式表示普通动作详情。

#### Scenario: 安全提醒继续使用 warning 语义
- **WHEN** 推荐、编排或计划卡片存在 `safetyNotes`
- **THEN** 系统 MUST 继续以 warning 语义展示安全或筛选提醒
- **AND** 动作详情入口 MUST 继续使用 `info` 语义，不与 warning 样式混用

