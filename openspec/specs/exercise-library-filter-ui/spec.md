# exercise-library-filter-ui Specification

## Purpose
TBD - created by archiving change improve-exercise-library-filter-ui. Update Purpose after archive.
## Requirements
### Requirement: 动作库核心筛选集中管理
动作库页面 SHALL 将肌群、分类、器械和目标作为核心筛选维度集中展示在筛选抽屉中，并且 MUST 使用现有 facets 选项和查询参数。页面默认工具栏 MUST 外露筛选入口和已选数量，而不是常驻展示多行筛选控件。

#### Scenario: 用户打开筛选抽屉
- **WHEN** 用户点击默认工具栏中的筛选入口
- **THEN** 系统 MUST 展示包含肌群、分类、器械和目标的 chip 筛选行
- **AND** 页面动作列表区域 MUST 不因抽屉打开而重新计算默认布局高度

#### Scenario: 用户点击核心筛选 chip
- **WHEN** 用户点击肌群、分类、器械或目标中的任一筛选 chip
- **THEN** 系统 MUST 使用对应的 `muscle`、`category`、`equipment` 或 `goalTag` 状态刷新 `/api/exercises`
- **AND** 被点击的 chip MUST 展示选中态

#### Scenario: 用户清空核心筛选行
- **WHEN** 用户点击某个核心筛选行的“全部”chip
- **THEN** 系统 MUST 清空该维度状态
- **AND** 后续请求 MUST NOT 携带该维度对应查询参数

### Requirement: 动作库低频筛选收纳
动作库页面 SHALL 将难度、居家条件、发力、机制、风险和状态收纳到筛选抽屉的“更多筛选”区域，并且 MUST 保留现有筛选能力。

#### Scenario: 用户展开更多筛选
- **WHEN** 用户打开筛选抽屉
- **THEN** 系统 MUST 展示难度、居家条件、发力、机制、风险和状态筛选控件
- **AND** 这些控件 MUST 使用现有 facets 选项或状态选项

#### Scenario: 用户使用更多筛选
- **WHEN** 用户在“更多筛选”区域选择任一低频筛选条件
- **THEN** 系统 MUST 使用对应查询参数刷新 `/api/exercises`
- **AND** 筛选抽屉 MUST 能表达当前低频筛选已生效

### Requirement: 动作库已选筛选可管理
动作库页面 SHALL 在默认工具栏和筛选抽屉中展示当前已选筛选条件，并且 MUST 支持单项移除和清除全部筛选。

#### Scenario: 用户移除单个筛选条件
- **WHEN** 用户点击某个已选筛选 chip 的移除按钮
- **THEN** 系统 MUST 只清空该筛选条件
- **AND** 其他筛选条件 MUST 保持不变

#### Scenario: 用户清除全部筛选条件
- **WHEN** 用户点击清除全部入口
- **THEN** 系统 MUST 清空搜索词、核心筛选和更多筛选条件
- **AND** 系统 MUST 将页码重置为第一页

### Requirement: 动作库结果工具栏分离排序分页控制
动作库页面 SHALL 将结果数量、分页摘要、排序和每页数量放在结果工具栏中，且 MUST 与属性筛选区视觉分离。

#### Scenario: 用户查看结果工具栏
- **WHEN** 用户打开动作库页面或筛选结果刷新
- **THEN** 系统 MUST 在结果工具栏展示总数、当前页和当前页条数
- **AND** 排序和每页数量控件 MUST 位于结果工具栏中

#### Scenario: 用户调整排序或每页数量
- **WHEN** 用户修改排序或每页数量
- **THEN** 系统 MUST 使用现有 `sort` 或 `pageSize` 查询参数刷新 `/api/exercises`
- **AND** 系统 MUST 将页码重置为第一页

### Requirement: 动作库列表查询必须服务端分页
动作库页面的 `/api/exercises` 列表查询 SHALL 在数据库查询层完成筛选、排序、计数和分页，并且 MUST NOT 为了生成当前页列表读取完整 `Exercise` 记录集合到服务端内存。

#### Scenario: 用户打开动作库第一页
- **WHEN** 用户打开动作库页面并请求 `/api/exercises?page=1&pageSize=24`
- **THEN** 系统 MUST 只返回当前页所需的 `ExerciseListItem` 摘要字段
- **AND** 系统 MUST 使用数据库计数结果计算 `total`、`totalPages`、`hasNextPage` 和 `hasPreviousPage`

#### Scenario: 用户使用筛选和排序
- **WHEN** 用户使用搜索词、分类、肌群、器械、难度、居家条件、目标、风险、状态或排序参数刷新 `/api/exercises`
- **THEN** 系统 MUST 在数据库层执行可下推的筛选和排序
- **AND** 系统 MUST 在分页前完成筛选结果计数

### Requirement: 动作库 facets 统计不得依赖完整动作详情集合
动作库页面的 facets 统计 SHALL 使用数据库聚合生成，并且 MUST NOT 为了统计筛选选项读取完整动作详情、教学步骤或 embedding 字段。

#### Scenario: 用户请求动作库筛选选项
- **WHEN** `/api/exercises` 返回 `facets`
- **THEN** 系统 MUST 通过数据库聚合返回分类、难度、发力、机制、器械、居家条件、肌群、目标和风险统计
- **AND** facets 统计 MUST 保持现有 `value`、`label`、`count` 响应结构

