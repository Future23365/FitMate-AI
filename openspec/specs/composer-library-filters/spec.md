# composer-library-filters Specification

## Purpose
TBD - created by archiving change adjust-composer-library-filters. Update Purpose after archive.
## Requirements
### Requirement: 动作编排页右侧动作库支持阶段筛选
动作编排页右侧动作库 SHALL 使用横向入口筛选动作阶段，并且入口 MUST 只包含热身、训练、拉伸三个阶段。

#### Scenario: 用户筛选动作阶段
- **WHEN** 用户在动作编排页右侧动作库点击热身、训练或拉伸入口
- **THEN** 系统 MUST 使用对应 `workoutSection` 请求 `/api/exercises`
- **AND** 右侧动作列表 MUST 展示该阶段过滤后的动作
- **AND** 系统 MUST 在入口中展示当前选中的筛选阶段

#### Scenario: 横向入口不再展示动作分类
- **WHEN** 用户打开动作编排页右侧动作库
- **THEN** 横向入口 MUST NOT 使用动作分类 facets 作为筛选 chip
- **AND** 横向入口 MUST 只表达热身、训练、拉伸三个动作阶段

#### Scenario: 阶段筛选不决定添加位置
- **WHEN** 用户选择右侧动作库的热身、训练或拉伸筛选
- **THEN** 系统 MUST NOT 因该筛选直接改变中间编排区当前添加位置
- **AND** 从右侧动作库添加动作时 MUST 继续使用中间编排区当前选中的添加阶段

### Requirement: 动作分类使用下拉筛选
动作编排页右侧动作库 SHALL 将动作分类作为下拉筛选项展示，并且筛选结果 MUST 使用现有 `category` 查询参数。

#### Scenario: 用户按分类筛选右侧动作库
- **WHEN** 用户在分类下拉框中选择某个分类
- **THEN** 系统 MUST 使用该分类值请求 `/api/exercises`
- **AND** 请求参数 MUST 包含 `category`
- **AND** 右侧动作列表 MUST 展示该分类过滤后的结果

#### Scenario: 用户清空分类筛选
- **WHEN** 用户将分类下拉框恢复为全部分类或点击清空筛选
- **THEN** 后续动作库请求 MUST NOT 携带 `category`

### Requirement: 动作编排页右侧动作库支持居家条件筛选
动作编排页右侧动作库 SHALL 支持居家条件筛选，并且筛选结果 MUST 使用现有 `homeRequirement` 查询参数和 `facets.homeRequirements` 选项。

#### Scenario: 用户按居家条件筛选右侧动作库
- **WHEN** 用户在居家条件下拉框中选择某个条件
- **THEN** 系统 MUST 使用该条件值请求 `/api/exercises`
- **AND** 请求参数 MUST 包含 `homeRequirement`
- **AND** 右侧动作列表 MUST 展示居家条件过滤后的结果

#### Scenario: 用户清空居家条件筛选
- **WHEN** 用户将居家条件下拉框恢复为全部条件或点击清空筛选
- **THEN** 后续动作库请求 MUST NOT 携带 `homeRequirement`

### Requirement: 清空筛选覆盖右侧动作库辅助筛选字段
动作编排页右侧动作库的清空筛选动作 SHALL 一次性清空搜索词、分类、肌群、器械、难度和居家条件，并且 MUST 保持当前阶段筛选。

#### Scenario: 用户清空全部筛选
- **WHEN** 用户点击右侧动作库的清空筛选按钮
- **THEN** 系统 MUST 清空搜索词、分类、肌群、器械、难度和居家条件
- **AND** 后续动作库请求 MUST 使用默认筛选条件
- **AND** 当前选中的热身、训练或拉伸阶段筛选 MUST 保持不变

### Requirement: 动作库阶段筛选在服务端过滤后分页
动作库查询 SHALL 支持 `workoutSection` 参数，并且系统 MUST 在分页前完成热身、训练、拉伸阶段过滤。

#### Scenario: 用户请求某个训练阶段的动作
- **WHEN** `/api/exercises` 请求包含 `workoutSection = "warmup"`、`"training"` 或 `"stretch"`
- **THEN** 系统 MUST 在服务端筛选出对应阶段动作
- **AND** 系统 MUST 基于筛选后的结果计算 `total`、分页和返回列表

#### Scenario: 请求不携带阶段筛选
- **WHEN** `/api/exercises` 请求不包含 `workoutSection`
- **THEN** 系统 MUST 保持原有动作库查询行为

