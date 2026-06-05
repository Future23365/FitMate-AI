## ADDED Requirements

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
