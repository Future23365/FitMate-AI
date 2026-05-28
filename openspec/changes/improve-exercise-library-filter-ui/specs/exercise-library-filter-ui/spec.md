## ADDED Requirements

### Requirement: 动作库核心筛选外露
动作库页面 SHALL 将肌群、分类、器械和目标作为核心筛选维度外露为 chip 筛选行，并且 MUST 使用现有 facets 选项和查询参数。

#### Scenario: 用户点击核心筛选 chip
- **WHEN** 用户点击肌群、分类、器械或目标中的任一筛选 chip
- **THEN** 系统 MUST 使用对应的 `muscle`、`category`、`equipment` 或 `goalTag` 状态刷新 `/api/exercises`
- **AND** 被点击的 chip MUST 展示选中态

#### Scenario: 用户清空核心筛选行
- **WHEN** 用户点击某个核心筛选行的“全部”chip
- **THEN** 系统 MUST 清空该维度状态
- **AND** 后续请求 MUST NOT 携带该维度对应查询参数

### Requirement: 动作库低频筛选收纳
动作库页面 SHALL 将难度、居家条件、发力、机制、风险和状态收纳到“更多筛选”区域，并且 MUST 保留现有筛选能力。

#### Scenario: 用户展开更多筛选
- **WHEN** 用户点击“更多筛选”入口
- **THEN** 系统 MUST 展示难度、居家条件、发力、机制、风险和状态筛选控件
- **AND** 这些控件 MUST 使用现有 facets 选项或状态选项

#### Scenario: 用户使用更多筛选
- **WHEN** 用户在“更多筛选”区域选择任一低频筛选条件
- **THEN** 系统 MUST 使用对应查询参数刷新 `/api/exercises`
- **AND** “更多筛选”入口 MUST 能表达当前低频筛选已生效

### Requirement: 动作库已选筛选可管理
动作库页面 SHALL 展示当前已选筛选条件，并且 MUST 支持单项移除和清除全部筛选。

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
