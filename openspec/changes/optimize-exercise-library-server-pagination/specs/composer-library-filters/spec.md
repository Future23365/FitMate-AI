## ADDED Requirements

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
