# chat-plan-card-item-layout Specification

## Purpose
TBD - created by archiving change sync-plan-card-item-layout. Update Purpose after archive.
## Requirements
### Requirement: 计划动作条目复用编排条目布局
聊天中的长期计划草稿卡片 SHALL 在每个训练日内使用与单次动作编排卡片一致的动作条目信息结构和视觉布局。

#### Scenario: 用户查看长期计划中的某个训练日
- **WHEN** 聊天流展示长期计划草稿卡片，并且用户选中任意训练日
- **THEN** 该训练日内的每个动作条目 MUST 使用与单次动作编排卡片一致的图片、动作名、器械与主要肌群、备注、组数和目标次数/时长布局

#### Scenario: 动作条目存在备注
- **WHEN** 长期计划训练日内的动作条目包含 `notes`
- **THEN** 系统 MUST 按单次动作编排卡片的备注位置和样式展示该备注，而不是使用计划卡片独有的分隔线或额外右对齐备注区域

### Requirement: 计划层差异仅保留在多天容器
长期计划草稿卡片 SHALL 只在计划层保留与单次编排不同的多天计划能力，动作条目内部不得维护独立于编排卡片的展示结构。

#### Scenario: 用户在长期计划中切换训练日
- **WHEN** 用户切换长期计划草稿卡片中的训练日
- **THEN** 系统 MUST 保留训练日切换、当天焦点、预估用时、安全建议和排班设置
- **AND** 新训练日内的动作条目 MUST 继续使用与单次动作编排一致的条目布局

#### Scenario: 编排条目布局后续调整
- **WHEN** 后续需要调整聊天训练草稿中的动作条目展示
- **THEN** 系统 MUST 通过共享组件或明确共享渲染边界同时影响单次动作编排和长期计划条目
- **AND** 不得在长期计划卡片中继续新增一套平行的动作条目布局

### Requirement: 条目统一不得改变训练数据契约
动作条目布局统一 SHALL 仅改变前端展示边界，不得改变长期计划或单次编排的数据结构、AI 输出结构、API 契约、保存逻辑或动作详情来源。

#### Scenario: 用户保存长期计划
- **WHEN** 用户在条目布局统一后的长期计划草稿卡片中保存计划
- **THEN** 系统 MUST 继续使用现有长期计划保存流程和请求数据结构
- **AND** 不得因为条目布局复用而改变保存到日程或 routine 的字段含义

#### Scenario: 用户打开动作详情
- **WHEN** 用户点击长期计划动作条目的详情按钮
- **THEN** 系统 MUST 继续通过现有 `ExerciseDetailIconButton` 打开 `ExercisePreviewSheet`
- **AND** 不得新增整行点击、额外文字按钮或新的详情面板

