# shared-right-drawer Specification

## Purpose
TBD - created by archiving change extract-shared-right-drawer. Update Purpose after archive.
## Requirements
### Requirement: 公共右侧抽屉外壳
系统 SHALL 提供一个公共右侧抽屉弹出组件，用于承载需要从屏幕右侧滑入的弹窗内容，并且 MUST 与业务领域类型解耦。

#### Scenario: 调用方打开右侧抽屉
- **WHEN** 调用方将公共右侧抽屉组件置为打开状态
- **THEN** 系统 MUST 在屏幕右侧展示抽屉面板
- **AND** 面板 MUST 使用现有右侧滑入动画
- **AND** 遮罩 MUST 使用现有淡入动画

#### Scenario: 调用方关闭右侧抽屉
- **WHEN** 调用方关闭公共右侧抽屉组件
- **THEN** 系统 MUST 播放右侧滑出和遮罩淡出动画
- **AND** 系统 MUST 在动画结束后卸载或隐藏不可交互的抽屉层

### Requirement: 公共右侧抽屉层级隔离
公共右侧抽屉组件 SHALL 通过 `document.body` portal 渲染弹窗层，并且 MUST 避免被页面主体缩放、滚动容器或局部 stacking context 影响。

#### Scenario: 页面主体应用 drawer-open 缩放
- **WHEN** 右侧抽屉打开并触发 `drawer-open` 页面主体缩放
- **THEN** 抽屉遮罩和面板 MUST 保持覆盖完整视口
- **AND** 抽屉面板 MUST NOT 跟随 `#app-content-wrapper` 一起缩放

### Requirement: 公共右侧抽屉交互行为
公共右侧抽屉组件 SHALL 统一处理关闭交互、滚动锁定和页面背景联动。

#### Scenario: 用户点击遮罩关闭
- **WHEN** 用户点击抽屉面板外的遮罩区域
- **THEN** 系统 MUST 调用调用方提供的关闭处理函数

#### Scenario: 用户按 Escape 关闭
- **WHEN** 用户在抽屉打开时按下 `Escape`
- **THEN** 系统 MUST 调用调用方提供的关闭处理函数

#### Scenario: 抽屉打开时锁定背景滚动
- **WHEN** 右侧抽屉处于打开状态
- **THEN** 系统 MUST 禁止背景页面滚动穿透
- **AND** 系统 MUST 为页面主体应用现有 `drawer-open` 背景联动

### Requirement: 动作详情抽屉迁移
动作详情抽屉 SHALL 基于公共右侧抽屉组件实现外壳行为，并且 MUST 保留现有动作详情内容、对外 props 和调用方业务语义。

#### Scenario: 用户在动作编排页打开动作详情
- **WHEN** 用户在动作编排页打开动作详情
- **THEN** 系统 MUST 通过公共右侧抽屉组件展示动作详情
- **AND** 动作图片、步骤、主操作按钮和关闭行为 MUST 与迁移前保持一致

#### Scenario: 用户在训练页打开动作详情
- **WHEN** 用户在训练页打开动作详情
- **THEN** 系统 MUST 通过公共右侧抽屉组件展示动作详情
- **AND** 训练页现有暂停训练语义 MUST 保持不变

### Requirement: 动作库筛选抽屉迁移
动作库筛选抽屉 SHALL 基于公共右侧抽屉组件实现外壳行为，并且 MUST 保留现有筛选状态、查询参数和已选条件管理能力。

#### Scenario: 用户打开动作库筛选抽屉
- **WHEN** 用户点击动作库页面的筛选入口
- **THEN** 系统 MUST 通过公共右侧抽屉组件展示筛选内容
- **AND** 肌群、分类、器械、目标和更多筛选控件 MUST 保持可用

#### Scenario: 用户在筛选抽屉中修改条件
- **WHEN** 用户在动作库筛选抽屉中选择或清除筛选条件
- **THEN** 系统 MUST 继续使用现有 `/api/exercises` 查询参数刷新结果
- **AND** 已选筛选 chip 的单项移除和清空全部能力 MUST 保持可用

