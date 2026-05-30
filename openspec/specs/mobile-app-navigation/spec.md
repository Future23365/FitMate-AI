# mobile-app-navigation Specification

## Purpose
定义普通应用页面在窄屏下的移动端导航入口、导航抽屉、桌面侧边栏一致性，以及独立布局页面的排除规则，确保用户在手机或窄屏窗口中仍可访问全局导航、新建对话、历史对话和设置入口。
## Requirements
### Requirement: Mobile navigation entry
系统 SHALL 在普通应用页面的 `lg` 以下视口提供可见的移动端导航入口。

#### Scenario: User opens a normal app page on a narrow viewport
- **WHEN** 用户在小于 `lg` 的视口打开首页、动作库、动作编排、训练日历或设置页
- **THEN** 系统显示一个可点击的移动端导航入口
- **AND** 桌面固定侧边栏仍然保持隐藏

#### Scenario: User opens a normal app page on a desktop viewport
- **WHEN** 用户在 `lg` 或更宽视口打开普通应用页面
- **THEN** 系统显示现有桌面固定侧边栏
- **AND** 系统不显示移动端导航入口

#### Scenario: User opens an independent layout page
- **WHEN** 用户打开 `/dev` 或 `/training`
- **THEN** 系统不显示桌面主侧边栏
- **AND** 系统不显示移动端导航入口

### Requirement: Mobile navigation drawer
系统 SHALL 在用户触发移动端导航入口后展示移动端导航抽屉。

#### Scenario: User opens mobile navigation
- **WHEN** 用户点击移动端导航入口
- **THEN** 系统显示包含导航项、新建对话和历史对话的移动端导航抽屉
- **AND** 抽屉内容与桌面侧边栏使用同一套导航数据和历史数据

#### Scenario: User closes mobile navigation
- **WHEN** 用户点击关闭按钮或遮罩区域
- **THEN** 系统关闭移动端导航抽屉

#### Scenario: User selects navigation from mobile drawer
- **WHEN** 用户在移动端导航抽屉中点击导航项、新建对话或历史对话
- **THEN** 系统执行对应导航或对话操作
- **AND** 系统关闭移动端导航抽屉

### Requirement: Mobile navigation accessibility and containment
系统 SHALL 保持移动端导航抽屉的基础可访问性和页面交互隔离。

#### Scenario: Mobile navigation drawer is open
- **WHEN** 移动端导航抽屉处于打开状态
- **THEN** 系统为抽屉提供语义化 dialog 标记和可识别标题
- **AND** 背景页面不应继续滚动

#### Scenario: Mobile navigation drawer is closed
- **WHEN** 移动端导航抽屉关闭
- **THEN** 系统恢复背景页面滚动能力

### Requirement: Responsive desktop sidebar rail
系统 SHALL 在普通应用页面根据桌面视口宽度切换左侧主侧边栏占位：宽度充足时展示完整侧边栏，宽度不足时展示图标 rail，并允许用户临时展开完整侧边栏。

#### Scenario: User opens a normal app page on a wide desktop viewport
- **WHEN** 用户在宽度充足的桌面视口打开首页、训练日历、动作编排、动作库或设置页
- **THEN** 系统显示现有完整左侧侧边栏
- **AND** 页面内容保留现有完整左侧侧边栏占位

#### Scenario: User opens a normal app page on a narrower desktop viewport
- **WHEN** 用户在较窄桌面视口打开首页、训练日历、动作编排、动作库或设置页
- **THEN** 系统将左侧侧边栏收缩为仅展示核心图标的 rail
- **AND** 页面内容只保留 rail 宽度的左侧占位

#### Scenario: User hovers or focuses the sidebar rail
- **WHEN** 用户将鼠标移动到收缩后的左侧 rail 上，或通过键盘 focus 到 rail 内元素
- **THEN** 系统向右展开完整侧边栏
- **AND** 展开的侧边栏作为浮层附在页面上，不重新挤压页面内容

#### Scenario: User leaves the expanded sidebar rail
- **WHEN** 用户鼠标离开收缩侧边栏，且 rail 内元素失去键盘 focus
- **THEN** 系统恢复图标 rail 展示
- **AND** 页面内容仍保持 rail 宽度的左侧占位

#### Scenario: User opens an independent layout page
- **WHEN** 用户打开 `/dev` 或 `/training`
- **THEN** 系统不显示桌面主侧边栏
- **AND** 系统不应用左侧主侧边栏占位

