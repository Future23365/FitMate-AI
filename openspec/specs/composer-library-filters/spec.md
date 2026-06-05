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

### Requirement: 动作编排页动作库筛选必须复用服务端分页列表
动作编排页右侧动作库 SHALL 复用 `/api/exercises` 的数据库分页列表查询，并且 MUST NOT 因阶段、分类、肌群、器械、难度或居家条件筛选而读取完整动作记录集合到服务端内存。

#### Scenario: 用户筛选编排页右侧动作库
- **WHEN** 用户在动作编排页右侧动作库修改搜索词、阶段、分类、肌群、器械、难度或居家条件
- **THEN** 系统 MUST 使用 `/api/exercises` 返回当前筛选下的一页列表结果
- **AND** 系统 MUST 在数据库查询层完成可下推筛选、排序、计数和分页

#### Scenario: 阶段筛选返回分页结果
- **WHEN** `/api/exercises` 请求包含 `suitability = "warmup"`、`"training"` 或 `"stretch"`
- **THEN** 系统 MUST 在分页前完成阶段适配过滤
- **AND** 返回的 `total` MUST 表示阶段过滤后的结果总数

### Requirement: 动作编排页动作库列表必须支持连续浏览
动作编排页右侧动作库 SHALL 支持用户在当前筛选条件下连续浏览后续分页结果，并且 MUST NOT 只暴露第一页动作。

#### Scenario: 用户无筛选浏览动作库
- **WHEN** 用户打开动作编排页右侧动作库且未设置任何筛选条件
- **THEN** 系统 MUST 展示第一页动作列表
- **AND** 用户滚动到列表底部附近时系统 MUST 自动加载下一页动作并追加到当前列表

#### Scenario: 用户手动加载更多动作
- **WHEN** 当前筛选结果还有下一页
- **THEN** 系统 MUST 在列表底部提供加载更多入口
- **AND** 用户点击后系统 MUST 使用同一筛选条件加载下一页动作

#### Scenario: 用户修改筛选条件
- **WHEN** 用户修改搜索词、阶段、分类、肌群、器械、难度或居家条件
- **THEN** 系统 MUST 重置为第一页结果
- **AND** 后续滚动或加载更多 MUST 基于新的筛选条件继续分页

