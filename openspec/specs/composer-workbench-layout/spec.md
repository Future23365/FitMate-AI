# composer-workbench-layout Specification

## Purpose
TBD - created by archiving change compact-composer-workbench-layout. Update Purpose after archive.
## Requirements
### Requirement: 动作编排页使用紧凑工作台布局
动作编排页 SHALL 将当前编排名称、核心指标和页面级操作集中在紧凑顶部区域，并优先展示当前动作编排区。

#### Scenario: 用户打开动作编排页
- **WHEN** 用户打开动作编排页
- **THEN** 页面顶部 MUST 展示当前编排名称
- **AND** 页面顶部 MUST 展示预计时长、动作数量、预计组数和预估消耗
- **AND** 页面顶部 MUST 提供新增编排、导入模板和保存编排操作
- **AND** 当前编排名称 MUST NOT 因指标或操作按钮过多被挤到不可读
- **AND** 页面 MUST NOT 使用大标题、副标题和独立摘要卡片连续占用首屏纵向空间

#### Scenario: 用户滚动动作编排页
- **WHEN** 用户向下滚动动作编排页
- **THEN** 顶部工作台栏 MUST 保持在可视区域顶部
- **AND** 顶部工作台栏 MUST 使用浮动 surface 效果与下方内容区分
- **AND** 顶部工作台栏 MUST NOT 遮挡当前编排区内容

#### Scenario: 用户编辑当前编排名称
- **WHEN** 用户点击当前编排名称的编辑入口
- **THEN** 系统 MUST 允许用户在紧凑顶部区域编辑名称
- **AND** 确认或取消后 MUST 回到紧凑顶部展示状态

### Requirement: 已保存编排在右侧栏展示
动作编排页 SHALL 在右侧栏提供“动作库”和“已保存”两种素材视图，并允许用户在两者之间切换。

#### Scenario: 用户查看右侧栏素材视图
- **WHEN** 用户打开动作编排页
- **THEN** 右侧栏 MUST 展示“动作库”和“已保存”切换入口
- **AND** “动作库”视图 MUST 保留现有搜索、筛选、动作详情和添加动作能力
- **AND** “已保存”入口 MUST 展示当前已保存编排数量
- **AND** 顶部工作台 MUST NOT 再展示已保存编排下拉入口

#### Scenario: 用户查看已保存编排
- **WHEN** 用户切换到右侧栏“已保存”视图
- **THEN** 系统 MUST 以纵向卡片列表展示已保存编排
- **AND** 每张卡片 MUST 支持打开、复制和删除已保存编排
- **AND** 当前正在编辑的编排 MUST 在列表中有可识别的选中状态

#### Scenario: 没有已保存编排
- **WHEN** 用户切换到“已保存”视图且没有已保存编排
- **THEN** 系统 MUST 在右侧栏展示空状态
- **AND** 空状态 MUST 提供保存当前编排的入口

#### Scenario: 用户选择已保存编排
- **WHEN** 用户从右侧栏“已保存”视图打开某个已保存编排
- **THEN** 系统 MUST 加载该编排到当前编辑区
- **AND** 右侧栏 MUST 保持可继续切换到动作库或其他已保存编排

